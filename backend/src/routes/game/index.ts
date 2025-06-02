import { FastifyInstance } from "fastify";
import { gameManager } from "../../game/gameManager";
import { db, queries } from "../../database/database";
import multiteamRoutes from "./multiteam";
import { GameState } from "../../game/gameState";

/**
 * Game API Documentation
 * 
 * GET /api/game/games - Get all active games
 * GET /api/game/games/:gameId - Get a specific game by ID
 * POST /api/game/games - Create a new game
 * POST /api/game/games/:gameId/join - Join an existing game
 * POST /api/game/games/:gameId/paddle - Update paddle position
 * GET /api/game/history - Get user's game history
 * GET /api/game/stats - Get user's game statistics
 * GET /api/game/leaderboard - Get global leaderboard
 * POST /api/game/games/:gameId/spectate - Spectate a game
 * POST /api/game/games/:gameId/leave - Leave a game
 * POST /api/game/matchmaking - Join matchmaking queue
 * GET /api/game/matchmaking/status - Check matchmaking status
 * POST /api/game/multiteam - Create or join multi-team game
 */
export default async function gameRoutes(server: FastifyInstance) {
  // 다중 팀 게임 관련 라우트 등록
  await server.register(multiteamRoutes, { prefix: '/multiteam' });
  
  // 모든 활성 게임 목록 조회
  server.get("/games", async (request, reply) => {
    try {
      const games = Array.from(gameManager.getGames().values()).map(game => ({
        id: game.id,
        playersCount: game.players.length,
        status: game.status,
        scores: game.players.map(p => p.score)
      }));
      
      return { success: true, games };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get games" });
    }
  });

  // 특정 게임 상태 조회
  server.get("/games/:gameId", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const game = gameManager.getGameState(gameId);
      
      if (!game) {
        return reply.status(404).send({ success: false, message: "Game not found" });
      }
      
      return { success: true, game };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get game" });
    }
  });

  // 새 게임 생성
  server.post("/games", async (request, reply) => {
    try {
      // 인증 검사 (선택적)
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const gameId = gameManager.createGame();
      const game = gameManager.getGameState(gameId);
      
      return { success: true, gameId, game };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to create game" });
    }
  });

  // 게임 참가
  server.post("/games/:gameId/join", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const { playerId } = request.body as { playerId: string };
      
      if (!playerId) {
        return reply.status(400).send({ success: false, message: "Player ID is required" });
      }
      
      const success = gameManager.addPlayer(gameId, playerId);
      
      if (!success) {
        return reply.status(400).send({ success: false, message: "Failed to join game" });
      }
      
      const game = gameManager.getGameState(gameId);
      
      return { success: true, game };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to join game" });
    }
  });

  // 패들 이동
  server.post("/games/:gameId/paddle", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const { playerId, direction } = request.body as { playerId: string; direction: 'up' | 'down' | 'stop' };
      
      if (!playerId || !direction) {
        return reply.status(400).send({ success: false, message: "Player ID and direction are required" });
      }
      
      gameManager.updatePlayerInput(playerId, { id: playerId, direction });
      
      return { success: true };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to update paddle" });
    }
  });

  // 게임 기록 조회
  server.get("/history", async (request, reply) => {
    try {
      // 인증 검사
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const user = request.user as any;
      const limit = request.query?.limit ? parseInt(request.query.limit as string) : 10;
      
      // 사용자의 게임 기록 가져오기
      const history = db.prepare(`
        SELECT 
          g.id, 
          g.gameId, 
          g.gameDate, 
          g.player1Score, 
          g.player2Score,
          u1.displayName as player1Name,
          u2.displayName as player2Name,
          CASE WHEN g.winnerId = u1.id THEN u1.displayName ELSE u2.displayName END as winnerName
        FROM game_records g
        JOIN users u1 ON g.player1Id = u1.id
        JOIN users u2 ON g.player2Id = u2.id
        WHERE g.player1Id = ? OR g.player2Id = ?
        ORDER BY g.gameDate DESC
        LIMIT ?
      `).all(user.id, user.id, limit);
      
      return { success: true, history };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get game history" });
    }
  });

  // 사용자 게임 통계 조회
  server.get("/stats", async (request, reply) => {
    try {
      // 인증 검사
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const user = request.user as any;
      
      // 사용자의 게임 통계 가져오기
      const stats = queries.getUserStats.get(user.id, user.id, user.id, user.id, user.id, user.id);
      
      return { success: true, stats };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get user stats" });
    }
  });

  // 글로벌 리더보드 조회
  server.get("/leaderboard", async (request, reply) => {
    try {
      const limit = request.query?.limit ? parseInt(request.query.limit as string) : 10;
      
      // 승리 횟수 기준 상위 사용자 조회
      const leaderboard = db.prepare(`
        SELECT 
          u.id, 
          u.displayName,
          u.profileImage,
          COUNT(CASE WHEN g.winnerId = u.id THEN 1 END) as wins,
          COUNT(CASE WHEN (g.player1Id = u.id OR g.player2Id = u.id) AND g.winnerId != u.id THEN 1 END) as losses,
          COUNT(CASE WHEN g.player1Id = u.id OR g.player2Id = u.id THEN 1 END) as totalGames
        FROM users u
        LEFT JOIN game_records g ON g.player1Id = u.id OR g.player2Id = u.id
        GROUP BY u.id
        ORDER BY wins DESC
        LIMIT ?
      `).all(limit);
      
      return { success: true, leaderboard };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get leaderboard" });
    }
  });
  
  // 게임 관전
  server.post("/games/:gameId/spectate", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const game = gameManager.getGameState(gameId);
      
      if (!game) {
        return reply.status(404).send({ success: false, message: "Game not found" });
      }
      
      if (game.status !== 'playing') {
        return reply.status(400).send({ success: false, message: "Game is not currently playing" });
      }
      
      // 관전은 실제로 소켓 연결에서 처리되므로 여기서는 게임 정보만 반환
      return { 
        success: true, 
        message: "You can now spectate this game", 
        game: {
          id: game.id,
          players: game.players.map(p => ({ id: p.id, score: p.score })),
          status: game.status
        }
      };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to spectate game" });
    }
  });
  
  // 게임 나가기
  server.post("/games/:gameId/leave", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const { playerId } = request.body as { playerId: string };
      
      if (!playerId) {
        return reply.status(400).send({ success: false, message: "Player ID is required" });
      }
      
      const game = gameManager.getPlayerGame(playerId);
      
      if (!game || game.id !== gameId) {
        return reply.status(404).send({ success: false, message: "Player not found in the specified game" });
      }
      
      // 게임에서 플레이어 제거
      const success = gameManager.removePlayerFromGame(gameId, playerId);
      
      if (!success) {
        return reply.status(400).send({ success: false, message: "Failed to leave game" });
      }
      
      return { success: true, message: "Left the game successfully" };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to leave game" });
    }
  });
  
  // 매치메이킹 큐 참가
  server.post("/matchmaking", async (request, reply) => {
    try {
      // 인증 검사
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const user = request.user as any;
      const { socketId } = request.body as { socketId: string };
      
      if (!socketId) {
        return reply.status(400).send({ success: false, message: "Socket ID is required" });
      }
      
      // 매치메이킹 큐에 사용자 추가
      const result = gameManager.addToMatchmaking(socketId, user.id);
      
      if (result.gameId) {
        // 즉시 매치가 성사된 경우
        return { 
          success: true,
          matched: true,
          gameId: result.gameId,
          message: "Match found! You've been added to a game."
        };
      }
      
      return { 
        success: true,
        matched: false,
        message: "Added to matchmaking queue. Waiting for opponent..."
      };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to join matchmaking" });
    }
  });
  
  // 매치메이킹 상태 확인
  server.get("/matchmaking/status", async (request, reply) => {
    try {
      // 인증 검사
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const user = request.user as any;
      
      // 매치메이킹 상태 확인
      const status = gameManager.getMatchmakingStatus(user.id);
      
      return { 
        success: true,
        inQueue: status.inQueue,
        queuePosition: status.position,
        estimatedWaitTime: status.estimatedWaitTime,
        queueLength: status.queueLength
      };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to get matchmaking status" });
    }
  });
  
  // 게임 설정 업데이트
  server.patch("/games/:gameId/settings", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const { difficulty, maxScore } = request.body as { difficulty?: 'easy' | 'normal' | 'hard', maxScore?: number };
      
      const game = gameManager.getGameState(gameId);
      
      if (!game) {
        return reply.status(404).send({ success: false, message: "Game not found" });
      }
      
      if (game.status !== 'waiting') {
        return reply.status(400).send({ success: false, message: "Cannot update settings of a game in progress" });
      }
      
      const updated = gameManager.updateGameSettings(gameId, { difficulty, maxScore });
      
      if (!updated) {
        return reply.status(400).send({ success: false, message: "Failed to update game settings" });
      }
      
      return { success: true, game: gameManager.getGameState(gameId) };
    } catch (error) {
      server.log.error(error);
      return reply.status(500).send({ success: false, message: "Failed to update game settings" });
    }
  });
}
