import { FastifyInstance } from "fastify";
import { gameManager } from "../../game/gameManager";

export default async function multiteamRoutes(server: FastifyInstance) {
  // 다중 팀 게임 생성 또는 참가
  server.post("/", async (request, reply) => {
    try {
      // 인증 확인
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      const user = request.user as any;
      
      // 기존 활성 다중 팀 게임 찾기
      const games = Array.from(gameManager.getGames().values()).filter(g => g.multiteam && g.status === 'waiting');
      
      let gameId: string;
      
      if (games.length > 0) {
        // 기존 다중 팀 게임 참가
        gameId = games[0].id;
      } else {
        // 새 다중 팀 게임 생성
        gameId = gameManager.createMultiplayerGame();
      }
      
      return { success: true, gameId };
    } catch (error) {
      server.log.error('Error creating/joining multiteam game:', error);
      return reply.status(500).send({ success: false, message: "Failed to create or join multiteam game" });
    }
  });

  // 현재 활성 다중 팀 게임 목록
  server.get("/", async (request, reply) => {
    try {
      // 인증 확인
      if (!request.isAuthenticated()) {
        return reply.status(401).send({ success: false, message: "Authentication required" });
      }
      
      // 활성 다중 팀 게임 찾기
      const games = Array.from(gameManager.getGames().values())
        .filter(g => g.multiteam)
        .map(game => ({
          id: game.id,
          playersCount: game.players.length,
          status: game.status,
          scores: game.players.map(p => p.score),
          teams: {
            left: game.players.filter(p => p.team === 'left').length,
            right: game.players.filter(p => p.team === 'right').length
          }
        }));
      
      return { success: true, games };
    } catch (error) {
      server.log.error('Error getting multiteam games:', error);
      return reply.status(500).send({ success: false, message: "Failed to get multiteam games" });
    }
  });
}
