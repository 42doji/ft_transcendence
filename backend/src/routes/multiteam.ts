import { FastifyInstance } from "fastify";
import { gameManager } from "../game/gameManager";

export default async function multiteamRoutes(server: FastifyInstance) {
  // 멀티티에 게임 참가 API
  server.post("/multiteam", async (request, reply) => {
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    try {
      // 집행 중인 게임 찾기
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
}
