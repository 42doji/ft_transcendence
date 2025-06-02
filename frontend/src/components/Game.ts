import { io, Socket } from "socket.io-client";

type GameMode = "local" | "multiplayer" | "multiteam";
type PaddleDirection = "up" | "down" | "none";

export interface GameState {
  id: string;
  players: {
    id: string;
    position: number;
    score: number;
    team?: "left" | "right"; // 플레이어 팀 지정
    paddleIndex?: number; // 패들 위치 인덱스
    paddleHeight?: number; // 패들 높이
    paddleColor?: string; // 패들 색상
  }[];
  teams?: {
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
  status: "waiting" | "playing" | "finished";
  width: number;
  height: number;
  lastUpdate: number;
  gameStartTime?: number; // 게임 시작 시간
  speedIncreaseInterval?: number; // 속도 증가 주기(ms)
  difficulty?: "easy" | "normal" | "hard"; // 게임 난이도
  maxScore?: number; // 승리 점수
  multiteam?: boolean; // 다중 플레이어 모드 여부
  paddleSpacing?: number; // 패들 간격
}

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private socket: Socket | null = null;
  private gameState: GameState | null = null;
  private playerId: string = "";
  private gameId: string = "";
  private gameMode: GameMode;
  private winner: string | null = null;
  private team: "left" | "right" | null = null;

  // 로컬 게임용 상태
  private localGameState: GameState | null = null;
  private keyState = {
    player1: { up: false, down: false },
    player2: { up: false, down: false },
  };
  private gameLoopInterval: number | null = null;

  // 이벤트 핸들러 참조 저장
  private boundKeyDownHandler: (e: KeyboardEvent) => void;
  private boundKeyUpHandler: (e: KeyboardEvent) => void;
  private handleKeyDown: (e: KeyboardEvent) => void;
  private handleKeyUp: (e: KeyboardEvent) => void;

  constructor(containerId: string, mode: GameMode = "multiplayer") {
    // 캠버스 요소 생성
    this.canvas = document.createElement("canvas");
    this.canvas.width = 800;
    this.canvas.height = 600;
    this.canvas.tabIndex = 1; // 키보드 포커스를 받을 수 있도록 tabIndex 설정
    this.canvas.style.outline = "none"; // 포커스 테두리 제거
    this.canvas.style.width = "100%"; // 컨테이너에 꼭 차게 설정
    this.canvas.style.height = "100%"; // 컨테이너에 꼭 차게 설정
    this.canvas.style.position = "absolute"; // 위치 정확히 지정
    this.canvas.style.left = "0";
    this.canvas.style.top = "0";
    this.ctx = this.canvas.getContext("2d")!;
    this.gameMode = mode;

    // 키보드 이벤트 핸들러 설정
    this.setupKeyboardListeners();

    const container = document.getElementById(containerId);
    if (container) {
      // 컨테이너를 빈 상태로 만들고 캔버스 추가
      container.innerHTML = "";
      container.style.position = "relative"; // 포지션 컨텍스트 생성
      container.style.overflow = "hidden"; // 오버플로우 방지
      container.appendChild(this.canvas);

      // 캔버스 클릭 시 포커스 주기 위한 이벤트 추가
      container.addEventListener("click", () => {
        console.log("Canvas container clicked, focusing canvas");
        this.canvas.focus();
      });

      // 캔버스에 포커스 주기
      setTimeout(() => {
        this.canvas.focus();
        console.log(`Game initialized in ${mode} mode. Canvas focused.`);
      }, 100);
    }

    if (this.gameMode === "multiplayer" || this.gameMode === "multiteam") {
      // Socket.IO 연결 (멀티플레이어 모드에서만)
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      this.socket = io(API_URL);
      this.setupSocketListeners();
    } else if (this.gameMode === "local") {
      // 로컬 게임 초기화
      this.initLocalGame();
    }

    // 게임 렌더링 루프
    this.startRenderLoop();
  }

  // 키보드 이벤트 리스너 설정
  private setupKeyboardListeners(): void {
    // 키다운 이벤트 핸들러
    this.handleKeyDown = (e: KeyboardEvent): void => {
      // 같은 키 이벤트가 중복으로 발생하는 것을 방지하기 위해 이벤트 배포 중지
      if (e.repeat) return;

      // 키코드 가져오기 - 한글 IME와 상관없이 작동하기 위해
      const keyCode = e.code; // KeyQ, KeyA, KeyO, KeyL 형태로 받음

      if (
        (this.gameMode === "multiplayer" || this.gameMode === "multiteam") &&
        this.socket
      ) {
        // 멀티플레이어 모드: 팀 기반 제어
        if (keyCode === "ArrowUp" || keyCode === "KeyO") {
          this.socket.emit("paddle_move", { direction: "up", team: "right" });
          console.log("Sent paddle move: up (right team)");
        } else if (keyCode === "ArrowDown" || keyCode === "KeyL") {
          this.socket.emit("paddle_move", { direction: "down", team: "right" });
          console.log("Sent paddle move: down (right team)");
        } else if (keyCode === "KeyQ") {
          this.socket.emit("paddle_move", { direction: "up", team: "left" });
          console.log("Sent paddle move: up (left team)");
        } else if (keyCode === "KeyA") {
          this.socket.emit("paddle_move", { direction: "down", team: "left" });
          console.log("Sent paddle move: down (left team)");
        }
      } else if (this.gameMode === "local") {
        // 로컬 모드: 플레이어 1 (Q/A), 플레이어 2 (O/L)
        if (keyCode === "KeyQ") {
          this.keyState.player1.up = true;
        } else if (keyCode === "KeyA") {
          this.keyState.player1.down = true;
        } else if (keyCode === "KeyO") {
          this.keyState.player2.up = true;
        } else if (keyCode === "KeyL") {
          this.keyState.player2.down = true;
        }
      }

      // 상태 변경 시 이벤트 전파 방지 (기본 브라우저 동작 방지)
      if (
        ["KeyQ", "KeyA", "KeyO", "KeyL", "ArrowUp", "ArrowDown"].includes(
          keyCode
        )
      ) {
        e.preventDefault();
      }
    };

    // 키업 이벤트 핸들러
    this.handleKeyUp = (e: KeyboardEvent): void => {
      // 키코드 가져오기 - 한글 IME와 상관없이 작동하기 위해
      const keyCode = e.code; // KeyQ, KeyA, KeyO, KeyL 형태로 받음

      if (
        (this.gameMode === "multiplayer" || this.gameMode === "multiteam") &&
        this.socket
      ) {
        // 멀티플레이어 모드
        if (keyCode === "ArrowUp" || keyCode === "KeyO") {
          this.socket.emit("paddle_move", { direction: "stop", team: "right" });
          console.log("Sent paddle move: stop (right team)");
        } else if (keyCode === "ArrowDown" || keyCode === "KeyL") {
          this.socket.emit("paddle_move", { direction: "stop", team: "right" });
          console.log("Sent paddle move: stop (right team)");
        } else if (keyCode === "KeyQ") {
          this.socket.emit("paddle_move", { direction: "stop", team: "left" });
          console.log("Sent paddle move: stop (left team)");
        } else if (keyCode === "KeyA") {
          this.socket.emit("paddle_move", { direction: "stop", team: "left" });
          console.log("Sent paddle move: stop (left team)");
        }
      } else if (this.gameMode === "local") {
        // 로컬 모드
        if (keyCode === "KeyQ") {
          this.keyState.player1.up = false;
        } else if (keyCode === "KeyA") {
          this.keyState.player1.down = false;
        } else if (keyCode === "KeyO") {
          this.keyState.player2.up = false;
        } else if (keyCode === "KeyL") {
          this.keyState.player2.down = false;
        }
      }

      // 이벤트 전파 방지
      if (
        ["KeyQ", "KeyA", "KeyO", "KeyL", "ArrowUp", "ArrowDown"].includes(
          keyCode
        )
      ) {
        e.preventDefault();
      }
    };

    // 이벤트 핸들러를 바인딩하여 저장
    this.boundKeyDownHandler = this.handleKeyDown.bind(this);
    this.boundKeyUpHandler = this.handleKeyUp.bind(this);

    // 이벤트 리스너 등록 - 캔버스와 window 모두에 이벤트 리스너 등록
    window.addEventListener("keydown", this.boundKeyDownHandler);
    window.addEventListener("keyup", this.boundKeyUpHandler);

    // 추가로 캔버스에도 리스너 등록 (포커스가 있을 때 확실한 동작 보장)
    this.canvas.addEventListener("keydown", this.boundKeyDownHandler);
    this.canvas.addEventListener("keyup", this.boundKeyUpHandler);

    console.log(
      "키보드 이벤트 리스너 등록 완료 - Window 및 Canvas에 이벤트 리스너 추가됨"
    );
  }

  // 로컬 게임 초기화
  private initLocalGame(): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const paddleHeight = 100; // 패들 높이 정의

    // 패들이 정확히 화면 중간에 위치하도록 설정 - 사용자 제안방식 적용
    // 단순하고 정확한 계산: 전체 높이에서 패들 높이를 빼고 나는 공간의 절반을 숴분어 위치 결정
    const availableSpace = height - paddleHeight;
    const centerPaddlePosition = 0 + availableSpace / 2;
    this.localGameState = {
      id: "local_game",
      players: [
        {
          id: "player1",
          position: centerPaddlePosition,
          score: 0,
          team: "left",
        },
        {
          id: "player2",
          position: centerPaddlePosition,
          score: 0,
          team: "right",
        },
      ],
      ball: {
        x: width / 2,
        y: height / 2,
        velocityX: 2 * 1.5, // 1.5배 속도 증가
        velocityY: 2 * 1.5, // 1.5배 속도 증가
        speedMultiplier: 1.0, // 속도 증가 요소 추가
      },
      status: "playing", // 시작부터 'playing' 상태로 설정
      width: width,
      height: height,
      lastUpdate: Date.now(),
      gameStartTime: Date.now(), // 게임 시작 시간 추가
      speedIncreaseInterval: 10000, // 10초마다 속도 증가
      multiteam: false, // 로컬 게임은 기본적으로 다중 팀 모드 아님
    };

    // 로컬 게임 루프 시작 - 60fps로 유지
    this.gameLoopInterval = window.setInterval(
      () => this.updateLocalGame(),
      1000 / 60
    );

    console.log("로컬 게임 초기화 완료");
    console.log("현재 키 상태:", this.keyState);
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    // 연결 성공
    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.playerId = this.socket.id;
    });

    // 게임 참가 성공
    this.socket.on("game_joined", (data: any) => {
      console.log("Joined game:", data.gameId);
      this.gameId = data.gameId;
      this.gameState = data.game;

      // 게임 모드 확인 및 설정
      if (data.game.multiteam) {
        console.log("Joined a multiteam game mode");
        // 팀 배정 정보 표시
        const leftTeam = data.game.players.filter(
          (p: any) => p.team === "left"
        );
        const rightTeam = data.game.players.filter(
          (p: any) => p.team === "right"
        );
        console.log(
          `Left team: ${leftTeam.length} players, Right team: ${rightTeam.length} players`
        );

        // 현재 플레이어의 팀 확인
        const currentPlayer = data.game.players.find(
          (p: any) => p.id === this.playerId
        );
        if (currentPlayer) {
          this.team = currentPlayer.team;
          console.log(`You are in ${this.team} team`);
        }
      }
    });

    // 게임 상태 업데이트
    this.socket.on("game_state", (state: any) => {
      this.gameState = state;

      // 게임이 종료되었는지 확인
      if (state.status === "finished") {
        // 승자 팀 확인
        const leftTeam = state.players.filter((p: any) => p.team === "left");
        const rightTeam = state.players.filter((p: any) => p.team === "right");

        const leftScore = leftTeam.length > 0 ? leftTeam[0].score : 0;
        const rightScore = rightTeam.length > 0 ? rightTeam[0].score : 0;

        if (leftScore > rightScore) {
          this.winner = "Left Team";
        } else {
          this.winner = "Right Team";
        }
      }
    });

    // 다른 플레이어 참가
    this.socket.on("player_joined", (data: any) => {
      console.log("Player joined:", data.playerId);
      if (data.team) {
        console.log(`Player joined ${data.team} team`);
      }
    });

    // 플레이어 퇴장
    this.socket.on("player_left", (data: any) => {
      console.log("Player left:", data.playerId);
      // 같은 팀의 플레이어가 모두 나가면 게임 종료
      if (this.gameState) {
        const leftTeam = this.gameState.players.filter(
          (p) => p.team === "left"
        );
        const rightTeam = this.gameState.players.filter(
          (p) => p.team === "right"
        );

        if (leftTeam.length === 0) {
          this.winner = "Right Team (Left team disconnected)";
          this.gameState = null;
        } else if (rightTeam.length === 0) {
          this.winner = "Left Team (Right team disconnected)";
          this.gameState = null;
        }
      }
    });

    // 게임 종료
    this.socket.on("game_over", (data: any) => {
      this.winner = data.winner;
      this.gameState = null;
    });

    // 오류 처리
    this.socket.on("join_error", (data: any) => {
      console.error("Error joining game:", data.message);
    });
  }

  public joinGame(gameId?: string): void {
    if (
      (this.gameMode === "multiplayer" || this.gameMode === "multiteam") &&
      this.socket
    ) {
      // multiteam 모드일 경우 추가 데이터 전송
      if (this.gameMode === "multiteam") {
        this.socket.emit("join_game", { gameId, multiteam: true });
      } else {
        this.socket.emit("join_game", gameId);
      }
    }
  }

  // 게임 종료 및 정리
  public destroy(): void {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    // 이벤트 리스너 제거
    window.removeEventListener("keydown", this.boundKeyDownHandler);
    window.removeEventListener("keyup", this.boundKeyUpHandler);

    // 캔버스 제거
    this.canvas.remove();
  }

  // 로컬 게임 상태 업데이트
  private updateLocalGame(): void {
    if (!this.localGameState) return;

    const game = this.localGameState;
    const paddleHeight = 100;
    const paddleWidth = 10;
    const paddleSpeed = 10; // 패들 속도
    const ballRadius = 10; // 공의 반지름

    // 시간에 따른 공 속도 증가 적용
    if (game.gameStartTime && game.speedIncreaseInterval) {
      const elapsedTime = Date.now() - game.gameStartTime;
      // 10초마다 공 속도 40% 증가, 최대 5배까지
      const speedIncreaseFactor =
        1.0 + (elapsedTime / game.speedIncreaseInterval) * 0.4;

      // 최대 속도 제한
      game.ball.speedMultiplier = Math.min(speedIncreaseFactor, 5.0);
    }

    if (this.keyState.player1.up) {
      game.players[0].position = Math.max(
        0,
        game.players[0].position - paddleSpeed
      );
    }
    if (this.keyState.player1.down) {
      game.players[0].position = Math.min(
        game.height - paddleHeight,
        game.players[0].position + paddleSpeed
      );
    }

    if (this.keyState.player2.up) {
      game.players[1].position = Math.max(
        0,
        game.players[1].position - paddleSpeed
      );
    }
    if (this.keyState.player2.down) {
      game.players[1].position = Math.min(
        game.height - paddleHeight,
        game.players[1].position + paddleSpeed
      );
    }

    // 공 위치 업데이트
    const speedMultiplier = game.ball.speedMultiplier || 1.0;
    game.ball.x += game.ball.velocityX * speedMultiplier;
    game.ball.y += game.ball.velocityY * speedMultiplier;

    // 상하 벽 충돌 처리 - 공이 벽 안으로 들어가지 않도록 바로 반사
    if (game.ball.y <= ballRadius) {
      game.ball.y = ballRadius;
      game.ball.velocityY = Math.abs(game.ball.velocityY); // 반드시 아래로 이동하도록 반사
    } else if (game.ball.y >= game.height - ballRadius) {
      game.ball.y = game.height - ballRadius;
      game.ball.velocityY = -Math.abs(game.ball.velocityY); // 반드시 위로 이동하도록 반사
    }

    // 왼쪽 패들 충돌 - 패들이 정확히 화면 끝에 있음
    if (
      game.ball.x - ballRadius <= 0 + paddleWidth && // 화면 좌측 끝에서 시작
      game.ball.y >= game.players[0].position &&
      game.ball.y <= game.players[0].position + paddleHeight
    ) {
      game.ball.x = paddleWidth + ballRadius; // 패들 바깥으로 배치
      game.ball.velocityX = Math.abs(game.ball.velocityX); // 반드시 오른쪽으로 이동하도록 반사
    }

    // 오른쪽 패들 충돌 - 패들이 정확히 화면 끝에 있음
    if (
      game.ball.x + ballRadius >= game.width - paddleWidth &&
      game.ball.y >= game.players[1].position &&
      game.ball.y <= game.players[1].position + paddleHeight
    ) {
      game.ball.x = game.width - paddleWidth - ballRadius; // 패들 바깥으로 배치
      game.ball.velocityX = -Math.abs(game.ball.velocityX); // 반드시 왼쪽으로 이동하도록 반사
    }

    // 득점 처리 - 공이 실제 게임 범위를 벗어날 때만 처리
    if (game.ball.x - ballRadius <= 0) {
      // 오른쪽 플레이어 득점
      game.players[1].score += 1;
      this.resetBall(game);

      // 게임 종료 확인
      if (game.players[1].score >= 10) {
        game.status = "finished";
        this.winner = "Player 2";
        clearInterval(this.gameLoopInterval!);
      }
    } else if (game.ball.x + ballRadius >= game.width) {
      // 왼쪽 플레이어 득점
      game.players[0].score += 1;
      this.resetBall(game);

      // 게임 종료 확인
      if (game.players[0].score >= 10) {
        game.status = "finished";
        this.winner = "Player 1";
        clearInterval(this.gameLoopInterval!);
      }
    }
  }

  // 공 위치 초기화
  private resetBall(game: GameState): void {
    game.ball.x = game.width / 2;
    game.ball.y = game.height / 2;

    // 좌우 방향은 마지막 득점한 사람의 반대쪽으로
    const direction = Math.random() > 0.5 ? 1 : -1;

    // 경기 후반에는 기본 속도로 유지 (speedMultiplier는 계속 증가)
    game.ball.velocityX = direction * 2 * 1.5; // 1.5배 속도 증가
    game.ball.velocityY = (Math.random() * 2 - 1) * 2 * 1.5; // 1.5배 속도 증가
  }

  private renderGame(): void {
    // 캔버스 크기를 명시적으로 설정 - 화면 크기에 맞게 조정
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;

    // 로컬 게임의 경우 게임 로직의 크기를 현재 캔버스 크기와 동기화
    if (this.gameMode === "local" && this.localGameState) {
      // 고정된 캔버스 크기에서 현재 크기로 전환
      this.localGameState.width = this.canvas.width;
      this.localGameState.height = this.canvas.height;
    }

    const { width, height } = this.canvas;
    const state =
      this.gameMode === "local" ? this.localGameState : this.gameState;

    // 캔버스 지우기
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, width, height);

    // 다중 팀 모드인 경우 팀 영역 표시
    if (state && state.multiteam) {
      // 왼쪽 팀 영역
      this.ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
      this.ctx.fillRect(0, 0, width / 2, height);

      // 오른쪽 팀 영역
      this.ctx.fillStyle = "rgba(255, 0, 0, 0.1)";
      this.ctx.fillRect(width / 2, 0, width / 2, height);

      // 팀 정보 표시
      this.ctx.font = "14px VT323";
      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.fillText(
        "Team Mode: Multiple players per team",
        width / 2,
        height - 10
      );
    }

    // 승자가 있는 경우 결과 화면 표시
    if (this.winner) {
      this.ctx.fillStyle = "black";
      this.ctx.fillRect(0, 0, width, height);

      this.ctx.font = "48px VT323";
      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("GAME OVER!", width / 2, height / 2 - 60);

      this.ctx.font = "36px VT323";
      this.ctx.fillText(
        `${this.winner.toUpperCase()} WINS!`,
        width / 2,
        height / 2
      );

      // 스코어 표시
      if (state && state.players.length >= 2) {
        // 팀별 점수 계산
        const leftTeamPlayers = state.players.filter(
          (p) => !p.team || p.team === "left"
        );
        const rightTeamPlayers = state.players.filter(
          (p) => p.team === "right"
        );

        const leftScore =
          leftTeamPlayers.length > 0 ? leftTeamPlayers[0].score : 0;
        const rightScore =
          rightTeamPlayers.length > 0 ? rightTeamPlayers[0].score : 0;

        this.ctx.font = "24px VT323";
        this.ctx.fillText(
          `FINAL SCORE: ${leftScore} - ${rightScore}`,
          width / 2,
          height / 2 + 60
        );
      }

      // 메인 메뉴로 돌아가기 안내
      this.ctx.font = "18px VT323";
      this.ctx.fillText(
        "PRESS ESC TO RETURN TO MAIN MENU",
        width / 2,
        height - 30
      );

      return;
    }

    // 게임 상태가 없을 때 - 멀티플레이어 모드만 해당(로컬 게임은 항상 게임 상태가 있어야 함)
    if (
      !state &&
      (this.gameMode === "multiplayer" || this.gameMode === "multiteam")
    ) {
      this.ctx.font = "30px VT323";
      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("WAITING FOR OTHER PLAYER...", width / 2, height / 2);
      return;
    }

    // 게임 상태가 없을 경우 - 오류 방지
    if (!state) {
      return;
    }

    // 중앙선 그리기
    this.ctx.strokeStyle = "white";
    this.ctx.setLineDash([5, 15]);
    this.ctx.beginPath();
    this.ctx.moveTo(width / 2, 0);
    this.ctx.lineTo(width / 2, height);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // 점수 표시
    this.ctx.font = "48px VT323";
    this.ctx.fillStyle = "white";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";

    if (state) {
      // teams 객체가 있는 경우 (서버 상태로부터 받은 데이터)
      if (state.teams) {
        // 왼쪽 팀 점수 표시
        this.ctx.fillText(state.teams.left.score.toString(), width / 4, 20);

        // 오른쪽 팀 점수 표시
        this.ctx.fillText(
          state.teams.right.score.toString(),
          (3 * width) / 4,
          20
        );
      }
      // 기존 방식(호환성 유지)
      else if (state.players && state.players.length > 0) {
        // 팀별 점수 합산
        const leftTeamPlayers = state.players.filter(
          (p) => !p.team || p.team === "left"
        );
        const rightTeamPlayers = state.players.filter(
          (p) => p.team === "right"
        );

        // 왼쪽 팀 점수 표시
        if (leftTeamPlayers.length > 0) {
          const leftTeamScore = leftTeamPlayers[0].score; // 팀 점수는 공유됨
          this.ctx.fillText(leftTeamScore.toString(), width / 4, 20);
        }

        // 오른쪽 팀 점수 표시
        if (rightTeamPlayers.length > 0) {
          const rightTeamScore = rightTeamPlayers[0].score; // 팀 점수는 공유됨
          this.ctx.fillText(rightTeamScore.toString(), (3 * width) / 4, 20);
        }
      }
    }

    // 패들 그리기
    const paddleWidth = 10;
    const defaultPaddleHeight = 100;

    if (state && state.players) {
      // 팀별로 패들 구분
      const leftTeamPlayers = state.players.filter(
        (p) => !p.team || p.team === "left"
      );
      const rightTeamPlayers = state.players.filter((p) => p.team === "right");

      // 왼쪽 팀 패들 (각 플레이어마다 자신의 패들을 그림)
      for (const player of leftTeamPlayers) {
        const paddleHeight = player.paddleHeight || defaultPaddleHeight;

        // 패들 위치를 캔버스 크기에 맞게 조정
        const rawPosition = state.height
          ? Math.floor((player.position * height) / state.height)
          : player.position;

        // 기본 색상 또는 지정된 색상 사용
        this.ctx.fillStyle = player.paddleColor || "rgb(100, 100, 255)";
        this.ctx.fillRect(0, rawPosition, paddleWidth, paddleHeight);

        // 패들 번호 표시 (여러 패들일 경우)
        if (leftTeamPlayers.length > 1) {
          this.ctx.font = "10px VT323";
          this.ctx.fillStyle = "white";
          this.ctx.textAlign = "center";
          this.ctx.fillText(
            `P${(player.paddleIndex || 0) + 1}`,
            paddleWidth + 10,
            rawPosition + paddleHeight / 2
          );
        }
      }

      // 왼쪽 팀 플레이어 수 표시
      if (leftTeamPlayers.length > 1) {
        this.ctx.font = "12px VT323";
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`${leftTeamPlayers.length} players`, 15, 20);
      }

      // 오른쪽 팀 패들 (각 플레이어마다 자신의 패들을 그림)
      for (const player of rightTeamPlayers) {
        const paddleHeight = player.paddleHeight || defaultPaddleHeight;

        // 패들 위치를 캔버스 크기에 맞게 조정
        const rawPosition = state.height
          ? Math.floor((player.position * height) / state.height)
          : player.position;

        // 기본 색상 또는 지정된 색상 사용
        this.ctx.fillStyle = player.paddleColor || "rgb(255, 100, 100)";
        this.ctx.fillRect(
          width - paddleWidth,
          rawPosition,
          paddleWidth,
          paddleHeight
        );

        // 패들 번호 표시 (여러 패들일 경우)
        if (rightTeamPlayers.length > 1) {
          this.ctx.font = "10px VT323";
          this.ctx.fillStyle = "white";
          this.ctx.textAlign = "center";
          this.ctx.fillText(
            `P${(player.paddleIndex || 0) + 1}`,
            width - paddleWidth - 10,
            rawPosition + paddleHeight / 2
          );
        }
      }

      // 오른쪽 팀 플레이어 수 표시
      if (rightTeamPlayers.length > 1) {
        this.ctx.font = "12px VT323";
        this.ctx.fillStyle = "white";
        this.ctx.textAlign = "right";
        this.ctx.fillText(`${rightTeamPlayers.length} players`, width - 15, 20);
      }
    }

    // 공 그리기
    if (state.ball) {
      this.ctx.fillStyle = "white";
      this.ctx.beginPath();
      this.ctx.arc(state.ball.x, state.ball.y, 10, 0, Math.PI * 2);
      this.ctx.fill();

      // 공 속도 표시 (디버깅용)
      if (state.ball.speedMultiplier) {
        this.ctx.textAlign = "center";
        this.ctx.font = "14px VT323";
        this.ctx.fillText(
          `속도: ${state.ball.speedMultiplier.toFixed(1)}x`,
          width / 2,
          height - 30
        );
      }
    }

    // 로컬 게임인 경우 컨트롤 안내 표시
    if (this.gameMode === "local") {
      this.ctx.font = "16px VT323";
      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "bottom";
      this.ctx.fillText("PLAYER 1: Q (UP) / A (DOWN)", width / 4, height - 10);
      this.ctx.fillText(
        "PLAYER 2: O (UP) / L (DOWN)",
        (3 * width) / 4,
        height - 10
      );
    } else if (this.gameMode === "multiteam") {
      // 멀티팀 게임인 경우 컨트롤 안내 표시
      this.ctx.font = "16px VT323";
      this.ctx.fillStyle = "white";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "bottom";
      this.ctx.fillText("LEFT TEAM: Q (UP) / A (DOWN)", width / 4, height - 30);
      this.ctx.fillText(
        "RIGHT TEAM: O (UP) / L (DOWN)",
        (3 * width) / 4,
        height - 30
      );
    }
  }

  private startRenderLoop(): void {
    const renderFrame = () => {
      this.renderGame();
      requestAnimationFrame(renderFrame);
    };

    renderFrame();

    // ESC 키를 누르면 게임 종료 및 메인 메뉴로 돌아가기
    window.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        (this.winner ||
          this.gameState?.status === "finished" ||
          this.localGameState?.status === "finished")
      ) {
        document.dispatchEvent(new CustomEvent("game-exit"));
      } else if (
        e.key === " " &&
        this.gameMode === "local" &&
        !this.localGameState
      ) {
        // 스페이스 키로 로컬 게임 시작
        this.initLocalGame();
      }
    });
  }
}
