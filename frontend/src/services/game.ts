import { api } from './api';

export interface GameState {
  id: string;
  players: { id: string; position: number; score: number }[];
  ball: { x: number; y: number; velocityX: number; velocityY: number };
  status: 'waiting' | 'playing' | 'finished';
  width: number;
  height: number;
  lastUpdate: number;
}

export interface GameStats {
  wins: number;
  losses: number;
  totalGames: number;
}

export interface GameHistoryItem {
  id: number;
  gameId: string;
  gameDate: string;
  player1Score: number;
  player2Score: number;
  player1Name: string;
  player2Name: string;
  winnerName: string;
}

export const gameService = {
  // 게임 목록 조회
  async getGames() {
    try {
      const response = await api.get('/api/game/games');
      return response.data.games;
    } catch (error) {
      console.error('Error fetching games:', error);
      throw error;
    }
  },

  // 특정 게임 상태 조회
  async getGame(gameId: string) {
    try {
      const response = await api.get(`/api/game/games/${gameId}`);
      return response.data.game as GameState;
    } catch (error) {
      console.error(`Error fetching game with ID ${gameId}:`, error);
      throw error;
    }
  },

  // 새 게임 생성
  async createGame() {
    try {
      const response = await api.post('/api/game/games');
      return response.data;
    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  },

  // 게임 참가
  async joinGame(gameId: string, playerId: string) {
    try {
      const response = await api.post(`/api/game/games/${gameId}/join`, { playerId });
      return response.data;
    } catch (error) {
      console.error(`Error joining game with ID ${gameId}:`, error);
      throw error;
    }
  },

  // 패들 이동
  async movePaddle(gameId: string, playerId: string, direction: 'up' | 'down' | 'stop') {
    try {
      const response = await api.post(`/api/game/games/${gameId}/paddle`, { playerId, direction });
      return response.data;
    } catch (error) {
      console.error(`Error moving paddle in game with ID ${gameId}:`, error);
      throw error;
    }
  },

  // 게임 기록 조회
  async getGameHistory(limit?: number) {
    try {
      const params = limit ? { limit } : {};
      const response = await api.get('/api/game/history', { params });
      return response.data.history as GameHistoryItem[];
    } catch (error) {
      console.error('Error fetching game history:', error);
      throw error;
    }
  },

  // 사용자 게임 통계 조회
  async getUserStats() {
    try {
      const response = await api.get('/api/game/stats');
      return response.data.stats as GameStats;
    } catch (error) {
      console.error('Error fetching user stats:', error);
      throw error;
    }
  }
};
