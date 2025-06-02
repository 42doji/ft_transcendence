export interface GameState {
  id: string;
  players: { 
    id: string; 
    position: number; 
    score: number;
    team: 'left' | 'right'; // 플레이어 팀 지정
    paddleIndex?: number; // 패들 위치 인덱스 (같은 팀에서 구분용)
    paddleHeight?: number; // 패들 높이 (기본값: 100)
    paddleColor?: string; // 패들 색상 (기본값: 팀 색상)
  }[];
  // 팀별 정보
  teams: {
    left: {
      score: number; // 팀 점수
      playerCount: number; // 플레이어 수
      paddleCount: number; // 패들 수
    };
    right: {
      score: number; // 팀 점수
      playerCount: number; // 플레이어 수
      paddleCount: number; // 패들 수
    };
  };
  ball: { 
    x: number; 
    y: number; 
    velocityX: number; 
    velocityY: number;
    speedMultiplier?: number; // 공 속도 증가 배율
  };
  status: 'waiting' | 'playing' | 'finished';
  width: number;
  height: number;
  lastUpdate: number;
  gameStartTime?: number; // 게임 시작 시간
  speedIncreaseInterval?: number; // 속도 증가 주기(ms)
  difficulty?: 'easy' | 'normal' | 'hard'; // 게임 난이도
  maxScore?: number; // 승리 점수
  multiteam?: boolean; // 다중 플레이어 모드 여부
  paddleSpacing?: number; // 다중 패들 간격
  locked?: boolean; // 게임이 잠금되어 있는지 여부
  startRequested?: boolean; // 게임 시작이 요청되었는지 여부
}

export interface PlayerInput {
  id: string;
  direction: 'up' | 'down' | 'stop';
}

// 게임 생성 함수
export function createGame(id: string, width = 800, height = 600, difficulty: 'easy' | 'normal' | 'hard' = 'normal'): GameState {
  // 난이도에 따른 초기 속도 설정
  const speedMultipliers = {
    'easy': 1.0,
    'normal': 1.3,
    'hard': 1.5
  };
  
  const velocityBase = 3; // 기본 속도
  const speedMultiplier = speedMultipliers[difficulty];
  
  return {
    id,
    players: [],
    teams: {
      left: {
        score: 0,
        playerCount: 0,
        paddleCount: 0
      },
      right: {
        score: 0,
        playerCount: 0,
        paddleCount: 0
      }
    },
    ball: { 
      x: width / 2, 
      y: height / 2, 
      velocityX: velocityBase * speedMultiplier, 
      velocityY: velocityBase * speedMultiplier,
      speedMultiplier: 1.0 // 초기 배율
    },
    status: 'waiting',
    width,
    height,
    lastUpdate: Date.now(),
    gameStartTime: undefined, // 게임 시작 시 설정
    speedIncreaseInterval: 10000, // 10초마다 속도 증가
    difficulty,
    paddleSpacing: 20, // 다중 패들 간 간격
    locked: false, // 게임 초기에는 잠금되지 않음
    startRequested: false // 게임 시작 요청 초기화
  };
}

// 게임 상태 업데이트 함수
export function updateGameState(game: GameState): GameState {
  // 시간 기반 업데이트
  const now = Date.now();
  const deltaTime = (now - game.lastUpdate) / 1000;
  game.lastUpdate = now;

  // 게임이 플레이 중이 아니면 업데이트 하지 않음
  if (game.status !== 'playing' || game.players.length < 2) {
    return game;
  }
  
  // 게임 시작 시간 설정 (처음으로 업데이트될 때)
  if (!game.gameStartTime) {
    game.gameStartTime = Date.now();
  }
  
  // 시간에 따른 공 속도 증가 적용
  if (game.gameStartTime && game.speedIncreaseInterval) {
    const elapsedTime = now - game.gameStartTime;
    // 10초마다 공 속도 40% 증가, 최대 5배까지
    const speedMultiplier = 1.0 + (elapsedTime / game.speedIncreaseInterval) * 0.4;
    game.ball.speedMultiplier = Math.min(speedMultiplier, 5.0);
  }

  // 공 위치 업데이트 (속도 배율 적용)
  const speedMultiplier = game.ball.speedMultiplier || 1.0;
  game.ball.x += game.ball.velocityX * speedMultiplier;
  game.ball.y += game.ball.velocityY * speedMultiplier;

  // 벽 충돌 확인
  if (game.ball.y <= 0 || game.ball.y >= game.height) {
    game.ball.velocityY *= -1;
  }

  // 패들 충돌 및 점수 확인
  const paddleWidth = 10;
  const defaultPaddleHeight = 100;
  const ballRadius = 10; // 공의 반지름
  
  // 왼쪽 팀 패들 충돌 확인 (모든 왼쪽 팀 플레이어 패들 확인)
  const leftTeamPlayers = game.players.filter(p => !p.team || p.team === 'left');
  let leftTeamCollision = false;
  
  for (const player of leftTeamPlayers) {
    const paddleHeight = player.paddleHeight || defaultPaddleHeight;
    if (
      game.ball.x - ballRadius <= paddleWidth &&
      game.ball.y >= player.position &&
      game.ball.y <= player.position + paddleHeight
    ) {
      game.ball.x = paddleWidth + ballRadius; // 패들 바깥으로 배치
      game.ball.velocityX = Math.abs(game.ball.velocityX); // 반드시 오른쪽으로 이동하도록 반사
      leftTeamCollision = true;
      break;
    }
  }
  
  // 오른쪽 팀 패들 충돌 확인 (모든 오른쪽 팀 플레이어 패들 확인)
  const rightTeamPlayers = game.players.filter(p => p.team === 'right');
  let rightTeamCollision = false;
  
  for (const player of rightTeamPlayers) {
    const paddleHeight = player.paddleHeight || defaultPaddleHeight;
    if (
      game.ball.x + ballRadius >= game.width - paddleWidth &&
      game.ball.y >= player.position &&
      game.ball.y <= player.position + paddleHeight
    ) {
      game.ball.x = game.width - paddleWidth - ballRadius; // 패들 바깥으로 배치
      game.ball.velocityX = -Math.abs(game.ball.velocityX); // 반드시 왼쪽으로 이동하도록 반사
      rightTeamCollision = true;
      break;
    }
  }

  // 점수 확인
  if (game.ball.x <= 0) {
    // 오른쪽 팀 점수
    game.teams.right.score += 1;
    
    // 개별 플레이어 점수도 업데이트(호환성 유지)
    const rightTeamPlayers = game.players.filter(p => p.team === 'right');
    rightTeamPlayers.forEach(player => {
      player.score += 1;
    });
    
    resetBall(game);
  } else if (game.ball.x >= game.width) {
    // 왼쪽 팀 점수
    game.teams.left.score += 1;
    
    // 개별 플레이어 점수도 업데이트(호환성 유지)
    const leftTeamPlayers = game.players.filter(p => !p.team || p.team === 'left');
    leftTeamPlayers.forEach(player => {
      player.score += 1;
    });
    
    resetBall(game);
  }

  return game;
}

// 공 위치 초기화
function resetBall(game: GameState) {
  game.ball.x = game.width / 2;
  game.ball.y = game.height / 2;
  
  // 좌우 방향은 마지막 득점한 사람의 반대쪽으로
  const direction = Math.random() > 0.5 ? 1 : -1;
  
  // 난이도에 따른 기본 속도 처리
  let baseVelocity = 3; // 기본 속도
  if (game.difficulty) {
    const speedMultipliers = {
      'easy': 1.0,
      'normal': 1.3,
      'hard': 1.5
    };
    baseVelocity *= speedMultipliers[game.difficulty];
  }
  
  // 속도 배율은 그대로 유지 (game.ball.speedMultiplier)
  game.ball.velocityX = direction * baseVelocity;
  game.ball.velocityY = (Math.random() * 2 - 1) * baseVelocity;
}

// 패들 위치 업데이트
export function updatePlayerPosition(game: GameState, input: PlayerInput): GameState {
  const playerIndex = game.players.findIndex(p => p.id === input.id);
  if (playerIndex === -1) return game;

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

  return game;
}