  // 게임 시작 요청
  requestStartGame(gameId: string, playerId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    
    // 현재 플레이어가 게임에 있지 않으면 시작 불가
    const player = game.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // 게임이 이미 시작되었거나 종료되었으면 시작 불가
    if (game.status !== 'waiting') return false;
    
    // 게임 시작 요청 플래그 설정
    game.startRequested = true;
    
    // 팀이 준비되었다면 게임 시작
    if (this.checkTeamsReady(game)) {
      this.startGame(gameId);
    }
    
    return true;
  }
  
  // 게임 시작
  startGame(gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    
    // 게임이 이미 시작되었거나 종료되었으면 시작 불가
    if (game.status !== 'waiting') return false;
    
    // 팀이 준비되지 않았으면 시작 불가
    if (!this.checkTeamsReady(game)) return false;
    
    // 게임 상태 변경
    game.status = 'playing';
    game.locked = true; // 게임 잠금
    game.gameStartTime = Date.now();
    
    // 게임 루프 시작
    this.startGameLoop(gameId);
    
    return true;
  }import { GameState, createGame, updateGameState, updatePlayerPosition, PlayerInput } from './gameState';

export class GameManager {
  private games: Map<string, GameState> = new Map();
  private playerGameMap: Map<string, string> = new Map(); // 플레이어 ID -> 게임 ID
  private gameLoops: Map<string, NodeJS.Timeout> = new Map();
  private matchmakingQueue: { socketId: string; userId: number }[] = [];
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private gameStartButtons: Map<string, boolean> = new Map(); // 게임별 시작 버튼 상태

  // 새 게임 생성
  createGame(): string {
    const gameId = `game_${Date.now()}`;
    const game = createGame(gameId);
    this.games.set(gameId, game);
    return gameId;
  }

  // 게임에 플레이어 추가
  addPlayer(gameId: string, playerId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    
    // 게임이 이미 시작되었다면 새 플레이어 참가 불가
    if (game.locked) {
      console.log('Game is locked. Cannot add new players.');
      return false;
    }
    
    // 최대 인원 체크 (기본값: 2명, multiteam이 true인 경우 무제한)
    if (!game.multiteam && game.players.length >= 2) return false;

    // 패들 초기 위치 설정
    const defaultPaddleHeight = 100;
    const paddleSpacing = game.paddleSpacing || 20; // 패들 간 간격
    
    // 팀 배정 로직
    let team = 'left';
    if (game.multiteam) {
      // 다중 플레이어 모드: 홀수번째 플레이어는 왼쪽 팀, 짝수번째 플레이어는 오른쪽 팀
      team = game.players.length % 2 === 0 ? 'left' : 'right';
    } else {
      // 일반 모드: 첫 번째 플레이어는 왼쪽, 두 번째 플레이어는 오른쪽
      team = game.players.length === 0 ? 'left' : 'right';
    }
    
    // 팀별 플레이어 수 증가
    if (team === 'left') {
      game.teams.left.playerCount++;
      game.teams.left.paddleCount++;
    } else {
      game.teams.right.playerCount++;
      game.teams.right.paddleCount++;
    }
    
    // 패들 인덱스 및 위치 계산
    const teamPlayers = game.players.filter(p => p.team === team);
    const paddleIndex = teamPlayers.length;
    
    // 모든 패들은 화면 중앙에 배치 - 겹쳐서 방어 가능하도록
    const paddleY = (game.height - defaultPaddleHeight) / 2;
    
    // 패들 색상 설정 (팀별 기본 색상에 강도 변화 적용)
    const baseColor = team === 'left' ? 'rgb(100, 100, 255)' : 'rgb(255, 100, 100)';
    // 각 패들마다 색상에 약간의 변화를 주어 구분이 쉽게 함
    const color = baseColor.replace(/\d+/, (match) => {
      const value = parseInt(match) + paddleIndex * 20;
      return Math.min(value, 255).toString();
    });
    
    game.players.push({
      id: playerId,
      position: paddleY,
      score: 0,
      team,
      paddleIndex,
      paddleHeight: defaultPaddleHeight,
      paddleColor: color
    });

    this.playerGameMap.set(playerId, gameId);
    
    // 게임 시작 버튼을 누른 경우나 양쪽 팀에 최소 1명씩 있고 플레이어가 4명(팀당 2명) 이상인 경우에 게임 시작
    if (game.startRequested && this.checkTeamsReady(game)) {
      this.startGame(gameId);
    }
    
    return true;
  }
  
  // 양쪽 팀에 최소 1명씩 있는지 확인
  private checkTeamsReady(game: GameState): boolean {
    const leftTeamPlayers = game.players.filter(p => p.team === 'left').length;
    const rightTeamPlayers = game.players.filter(p => p.team === 'right').length;
    
    return leftTeamPlayers > 0 && rightTeamPlayers > 0;
  }

  // 플레이어 패들 업데이트
  updatePlayerInput(playerId: string, input: PlayerInput): void {
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) return;
    
    const game = this.games.get(gameId);
    if (!game) return;
    
    // 플레이어 인덱스 찾기
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    
    console.log(`Updating player ${playerId} (index: ${playerIndex}) with direction: ${input.direction}`);
    
    // 패들 이동 로직
    const paddleSpeed = 10;
    const paddleHeight = 100;

    if (input.direction === 'up') {
      game.players[playerIndex].position = Math.max(0, game.players[playerIndex].position - paddleSpeed);
    } else if (input.direction === 'down') {
      game.players[playerIndex].position = Math.min(
        game.height - paddleHeight,
        game.players[playerIndex].position + paddleSpeed
      );
    }
  }  

  // 게임 루프 시작
  private startGameLoop(gameId: string): void {
    // 이미 실행 중인 루프가 있다면 제거
    if (this.gameLoops.has(gameId)) {
      clearInterval(this.gameLoops.get(gameId)!);
    }

    const intervalId = setInterval(() => {
      const game = this.games.get(gameId);
      if (!game) {
        clearInterval(intervalId);
        return;
      }

      updateGameState(game);
      
      // 게임 종료 조건 (예: 한 플레이어가 10점)
      if (game.players.some(player => player.score >= 10)) {
        game.status = 'finished';
        clearInterval(intervalId);
      }
    }, 1000 / 60); // 60 FPS

    this.gameLoops.set(gameId, intervalId);
  }

  // 게임 상태 가져오기
  getGameState(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  // 모든 게임 가져오기
  getGames(): Map<string, GameState> {
    return this.games;
  }

  // 플레이어가 속한 게임 찾기
  getPlayerGame(playerId: string): GameState | undefined {
    const gameId = this.playerGameMap.get(playerId);
    if (!gameId) return undefined;
    return this.games.get(gameId);
  }

  // 게임 제거
  removeGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) return;

    // 게임 루프 중지
    if (this.gameLoops.has(gameId)) {
      clearInterval(this.gameLoops.get(gameId)!);
      this.gameLoops.delete(gameId);
    }

    // 플레이어 매핑 제거
    for (const player of game.players) {
      this.playerGameMap.delete(player.id);
    }

    // 게임 제거
    this.games.delete(gameId);
  }
  
  // 게임에서 플레이어 제거
  removePlayerFromGame(gameId: string, playerId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return false;
    
    // 플레이어 팀 정보 가져오기
    const { team } = game.players[playerIndex];
    
    // 팀별 플레이어 수 감소
    if (team === 'left') {
      game.teams.left.playerCount--;
      game.teams.left.paddleCount--;
    } else {
      game.teams.right.playerCount--;
      game.teams.right.paddleCount--;
    }
    
    // 플레이어 제거
    game.players.splice(playerIndex, 1);
    this.playerGameMap.delete(playerId);
    
    // 플레이어가 없으면 게임 종료
    if (game.players.length === 0) {
      this.removeGame(gameId);
      return true;
    }
    
    // 패들 인덱스 재정리
    // 남은 플레이어들의 패들 인덱스와 위치 재배치
    const leftTeamPlayers = game.players.filter(p => !p.team || p.team === 'left');
    const rightTeamPlayers = game.players.filter(p => p.team === 'right');
    
    // 왼쪽 팀 패들 재배치
    leftTeamPlayers.forEach((player, index) => {
      player.paddleIndex = index;
      const usableHeight = game.height - (player.paddleHeight || 100);
      player.position = (index === 0) 
        ? (game.height - (player.paddleHeight || 100)) / 2  // 첫 번째 패들은 중앙
        : usableHeight / (leftTeamPlayers.length + 1) * index; // 나머지 패들은 고르게 배치
    });
    
    // 오른쪽 팀 패들 재배치
    rightTeamPlayers.forEach((player, index) => {
      player.paddleIndex = index;
      const usableHeight = game.height - (player.paddleHeight || 100);
      player.position = (index === 0) 
        ? (game.height - (player.paddleHeight || 100)) / 2  // 첫 번째 패들은 중앙
        : usableHeight / (rightTeamPlayers.length + 1) * index; // 나머지 패들은 고르게 배치
    });
    
    // 팀 체크 후 게임 상태 업데이트
    if (game.status === 'playing' && !this.checkTeamsReady(game)) {
      game.status = 'waiting';
      
      // 게임 루프 중지
      if (this.gameLoops.has(gameId)) {
        clearInterval(this.gameLoops.get(gameId)!);
        this.gameLoops.delete(gameId);
      }
    }
    
    return true;
  }
  
  // 다중 플레이어 게임 생성
  createMultiplayerGame(): string {
    const gameId = `game_${Date.now()}`;
    const game = createGame(gameId);
    game.multiteam = true; // 다중 플레이어 모드 활성화
    this.games.set(gameId, game);
    return gameId;
  }
  
  // 매치메이킹 큐에 추가
  addToMatchmaking(socketId: string, userId: number): { gameId?: string } {
    // 큐에 이미 있는지 확인
    const existingIndex = this.matchmakingQueue.findIndex(item => item.userId === userId);
    if (existingIndex !== -1) {
      // 소켓 ID 업데이트
      this.matchmakingQueue[existingIndex].socketId = socketId;
      return {};
    }
    
    // 큐에 추가
    this.matchmakingQueue.push({ socketId, userId });
    
    // 매치메이킹 처리 시작 (아직 시작되지 않았다면)
    if (!this.matchmakingInterval) {
      this.startMatchmaking();
    }
    
    // 즉시 매치 시도
    return this.processMatchmaking();
  }
  
  // 매치메이킹 큐에서 제거
  removeFromMatchmaking(userId: number): void {
    const index = this.matchmakingQueue.findIndex(item => item.userId === userId);
    if (index !== -1) {
      this.matchmakingQueue.splice(index, 1);
    }
    
    // 큐가 비어있으면 매치메이킹 중단
    if (this.matchmakingQueue.length === 0 && this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }
  }
  
  // 매치메이킹 상태 조회
  getMatchmakingStatus(userId: number): { inQueue: boolean; position: number; estimatedWaitTime: number; queueLength: number } {
    const index = this.matchmakingQueue.findIndex(item => item.userId === userId);
    
    return {
      inQueue: index !== -1,
      position: index !== -1 ? index + 1 : 0,
      estimatedWaitTime: index !== -1 ? index * 10 : 0, // 예상 대기 시간(초)
      queueLength: this.matchmakingQueue.length
    };
  }
  
  // 매치메이킹 처리 시작
  private startMatchmaking(): void {
    this.matchmakingInterval = setInterval(() => {
      this.processMatchmaking();
    }, 5000); // 5초마다 매치메이킹 처리
  }
  
  // 매치메이킹 처리
  private processMatchmaking(): { gameId?: string } {
    if (this.matchmakingQueue.length < 2) {
      return {}; // 큐에 2명 이상이 없으면 매치 불가
    }
    
    // 일반 게임 매치메이킹: 2명씩 매치
    if (this.matchmakingQueue.length >= 2) {
      const player1 = this.matchmakingQueue.shift()!;
      const player2 = this.matchmakingQueue.shift()!;
      
      // 새 게임 생성
      const gameId = this.createGame();
      
      // 플레이어 추가
      this.addPlayer(gameId, player1.socketId);
      this.addPlayer(gameId, player2.socketId);
      
      return { gameId };
    }
    
    return {};
  }
  
  // 게임 설정 업데이트
  updateGameSettings(gameId: string, settings: { difficulty?: 'easy' | 'normal' | 'hard'; maxScore?: number }): boolean {
    const game = this.games.get(gameId);
    if (!game || game.status !== 'waiting') return false;
    
    if (settings.difficulty) {
      game.difficulty = settings.difficulty;
      
      // 난이도에 따른 공 속도 조정
      const velocityBase = 3;
      const speedMultipliers = {
        'easy': 1.0,
        'normal': 1.3,
        'hard': 1.5
      };
      
      const speedMultiplier = speedMultipliers[settings.difficulty];
      game.ball.velocityX = velocityBase * speedMultiplier * (game.ball.velocityX > 0 ? 1 : -1);
      game.ball.velocityY = velocityBase * speedMultiplier * (game.ball.velocityY > 0 ? 1 : -1);
    }
    
    if (settings.maxScore) {
      game.maxScore = settings.maxScore;
    }
    
    return true;
  }
}

// 싱글톤 인스턴스
export const gameManager = new GameManager();