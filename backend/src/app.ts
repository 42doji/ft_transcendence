import fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import session from "@fastify/session";
import formBody from "@fastify/formbody";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { setupAuth } from "./config/passport";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/game";
import userRoutes from "./routes/users";
import { gameManager } from "./game/gameManager";
import { db, queries } from "./database/database";

// 환경 변수 로드
dotenv.config();

// Fastify 서버 인스턴스 생성
const server: FastifyInstance = fastify({
  logger: true,
});

// 서버 시작
const start = async () => {
  try {
    // 플러그인 등록
    await server.register(cors, {
      origin: "http://localhost:3000",
      credentials: true,
    });

    await server.register(cookie);
    await server.register(formBody);
    
    await server.register(session, {
      secret: process.env.JWT_SECRET || "a-very-long-secret-that-should-be-changed",
      cookieName: "sessionId",
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24시간
      }
    });

    // Passport 설정
    await setupAuth(server);

    // API 라우터 등록
    await server.register(authRoutes, { prefix: '/api/auth' });
    await server.register(gameRoutes, { prefix: '/api/game' });
    await server.register(userRoutes, { prefix: '/api/users' });

    // 기본 라우트
    server.get("/", async (request, reply) => {
      return { hello: "ft_transcendence API" };
    });

    // 상태 확인 라우트
    server.get("/api/health", async (request, reply) => {
      return { status: "ok" };
    });
    
    // 연결된 사용자들의 현재 상태 반환 API
    server.get("/api/status/users", async (request, reply) => {
      // 가능한 상태: online, offline, in_game
      try {
        const onlineUsers = db.prepare(`
          SELECT id, displayName, status, profileImage 
          FROM users 
          WHERE status != 'offline'
        `).all();
        return { success: true, users: onlineUsers };
      } catch (error) {
        server.log.error(error);
        return reply.status(500).send({ success: false, message: "Failed to get user status" });
      }
    });
    
    // 멀티티에 게임 참가 API
    server.post("/api/game/multiteam", async (request, reply) => {
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      try {
        // 집청 중인 게임 찾기
        const games = Array.from(gameManager.getGames().values());
        let multiTeamGame = games.find(g => g.multiteam === true && g.status === 'waiting');
        
        // 게임이 없으면 새로 만들기
        if (!multiTeamGame) {
          const gameId = gameManager.createMultiplayerGame();
          multiTeamGame = gameManager.getGameState(gameId);
        }
        
        return { success: true, gameId: multiTeamGame?.id };
      } catch (error) {
        server.log.error(error);
        return reply.status(500).send({ success: false, message: "Failed to join multiteam game" });
      }
    });

    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    const address = await server.listen({ port, host: "0.0.0.0" });
    console.log(`Server listening at ${address}`);

    // Socket.IO 설정
    const io = new Server(server.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    // 소켓 연결 이벤트
    io.on("connection", (socket) => {
      console.log("Client connected:", socket.id);
      
      // 사용자 정보 저장
      let userId: number | null = null;
      
      // 사용자 아이디 설정 (로그인한 사용자만)
      socket.on("set_user_id", (data: { userId: number }) => {
        userId = data.userId;
        socket.data.userId = userId; // 소켓 데이터에 사용자 ID 저장
        console.log(`User ID set for socket ${socket.id}: ${userId}`);
        
        // 사용자 상태 업데이트 (온라인)
        queries.updateUserStatus.run('online', userId);
      });

      // 게임 참가
      socket.on("join_game", (gameId?: string) => {
        let targetGameId = gameId;
        
        // 게임 ID가 없거나 존재하지 않는 경우 새 게임 생성
        if (!targetGameId || !gameManager.getGameState(targetGameId)) {
          // 새 게임 찾기 (대기 중인 게임)
          const games = Array.from(gameManager.getGames().values());
          const waitingGame = games.find(g => g.status === 'waiting' && g.players.length < 2);
          
          if (waitingGame) {
            targetGameId = waitingGame.id;
          } else {
            targetGameId = gameManager.createGame();
          }
        }
        
        // 게임에 플레이어 추가
        const success = gameManager.addPlayer(targetGameId, socket.id);
        if (success) {
          // 소켓을 게임 방에 조인
          socket.join(targetGameId);
          
          // 게임 상태 전송
          const game = gameManager.getGameState(targetGameId);
          socket.emit("game_joined", { gameId: targetGameId, game });
          
          // 다른 플레이어에게 알림
          socket.to(targetGameId).emit("player_joined", { playerId: socket.id });
        } else {
          socket.emit("join_error", { message: "Cannot join the game" });
        }
      });

      // 패들 이동
      socket.on("paddle_move", (data: { direction: 'up' | 'down' | 'stop' | 'player1_up' | 'player1_down' | 'player1_stop' }) => {
        // 기존 패들 이동 처리
        if (data.direction === 'up' || data.direction === 'down' || data.direction === 'stop') {
          gameManager.updatePlayerInput(socket.id, {
            id: socket.id,
            direction: data.direction
          });
        } 
        // 플레이어 1 전용 패들 이동 처리 (q, a 키)
        else if (data.direction === 'player1_up' || data.direction === 'player1_down' || data.direction === 'player1_stop') {
          const game = gameManager.getPlayerGame(socket.id);
          if (game && game.players.length > 0) {
            // 첫 번째 플레이어의 ID를 가져와서 반영
            const player1Id = game.players[0]?.id;
            if (player1Id) {
              const actualDirection = data.direction === 'player1_up' ? 'up' : 
                                    data.direction === 'player1_down' ? 'down' : 'stop';
              gameManager.updatePlayerInput(player1Id, {
                id: player1Id,
                direction: actualDirection
              });
            }
          }
        }
      });

      // 게임 상태 요청
      socket.on("get_game_state", () => {
        const game = gameManager.getPlayerGame(socket.id);
        if (game) {
          socket.emit("game_state", game);
        }
      });

      // 핑-퐁 테스트 이벤트
      socket.on("ping", () => {
        socket.emit("pong");
      });

      // 연결 해제 이벤트
      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        
        // 사용자 상태 업데이트 (오프라인)
        if (userId) {
          queries.updateUserStatus.run('offline', userId);
        }
        
        // 플레이어가 속한 게임 찾기
        const game = gameManager.getPlayerGame(socket.id);
        if (game) {
          // 게임이 플레이 중이고 두 플레이어가 있으면 결과 저장
          if (game.status === 'playing' && game.players.length === 2) {
            const player1 = game.players[0];
            const player2 = game.players[1];
            
            // 게임 종료 처리
            game.status = 'finished';
            
            // 승자 결정
            const winnerId = player1.score > player2.score ? player1.id : player2.id;
            socket.to(game.id).emit("game_over", { winner: winnerId === player1.id ? 'Player 1' : 'Player 2' });
            
            // 로그인한 사용자들만 기록 저장 (멀티플레이어 전용)
            try {
              const player1Socket = io.sockets.sockets.get(player1.id);
              const player2Socket = io.sockets.sockets.get(player2.id);
              
              // 소켓의 userId 데이터 가져오기
              const player1UserId = player1Socket?.data.userId;
              const player2UserId = player2Socket?.data.userId;
              
              if (player1UserId && player2UserId) {
                // 로그인한 사용자들의 경기만 데이터베이스에 저장
                const winnerUserId = winnerId === player1.id ? player1UserId : player2UserId;
                
                queries.saveGameRecord.run({
                  gameId: game.id,
                  player1Id: player1UserId,
                  player2Id: player2UserId,
                  player1Score: player1.score,
                  player2Score: player2.score,
                  winnerId: winnerUserId
                });
                
                console.log(`Game record saved: ${player1UserId} vs ${player2UserId}, winner: ${winnerUserId}`);
              }
            } catch (error) {
              console.error('Error saving game record:', error);
            }
          }
          
          // 게임에서 플레이어 제거
          gameManager.removePlayerFromGame(game.id, socket.id);
          
          // 다른 플레이어에게 알림
          socket.to(game.id).emit("player_left", { playerId: socket.id });
        }
        
        // 매치메이킹 큐에서 제거
        if (userId) {
          gameManager.removeFromMatchmaking(userId);
        }
      });
    });

    // 게임 상태 브로드캐스트 (주기적으로 모든 클라이언트에게 게임 상태 전송)
    setInterval(() => {
      for (const [gameId, game] of gameManager.getGames()) {
        if (game.status === 'playing') {
          io.to(gameId).emit("game_state", game);
        }
        
        // 게임 종료 체크
        if (game.status === 'playing' && game.players.length === 2) {
          const player1 = game.players[0];
          const player2 = game.players[1];
          
          // 게임 종료 조건 (예: 한 플레이어가 10점)
          if (player1.score >= 10 || player2.score >= 10) {
            game.status = 'finished';
            
            // 승자 결정
            const winnerId = player1.score > player2.score ? player1.id : player2.id;
            io.to(gameId).emit("game_over", { winner: winnerId === player1.id ? 'Player 1' : 'Player 2' });
            
            // 로그인한 사용자들만 기록 저장 (멀티플레이어 전용)
            try {
              const player1Socket = io.sockets.sockets.get(player1.id);
              const player2Socket = io.sockets.sockets.get(player2.id);
              
              // 소켓의 userId 데이터 가져오기
              const player1UserId = player1Socket?.data.userId;
              const player2UserId = player2Socket?.data.userId;
              
              if (player1UserId && player2UserId) {
                // 로그인한 사용자들의 경기만 데이터베이스에 저장
                const winnerUserId = winnerId === player1.id ? player1UserId : player2UserId;
                
                queries.saveGameRecord.run({
                  gameId: game.id,
                  player1Id: player1UserId,
                  player2Id: player2UserId,
                  player1Score: player1.score,
                  player2Score: player2.score,
                  winnerId: winnerUserId
                });
                
                console.log(`Game record saved: ${player1UserId} vs ${player2UserId}, winner: ${winnerUserId}`);
              }
            } catch (error) {
              console.error('Error saving game record:', error);
            }
          }
        }
      }
    }, 1000 / 30); // 30 FPS로 상태 업데이트
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
