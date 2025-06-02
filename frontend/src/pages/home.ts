import { router } from "../services/router";
import { authService } from "../services/api";
import { gameService, GameHistoryItem } from "../services/game";
import { io } from "socket.io-client";
import { Game } from "../components/Game";

// 소켓 연결 준비
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const socket = io(API_URL);

// 현재 사용자 정보
let currentUser: any = null;
let game: Game | null = null;

// 멀티플레이어 팀 게임 설정
let maxPlayers = 2;
let isMultiTeam = false;

export async function loadUser() {
  try {
    currentUser = await authService.getMe();
    console.log("Current user:", currentUser);
    
    // 사용자 정보가 있고 소켓이 연결되어 있다면 사용자 ID 전송
    if (currentUser && currentUser.id && socket.connected) {
      socket.emit("set_user_id", { userId: currentUser.id });
      console.log(`Sent user ID to server: ${currentUser.id}`);
    }
  } catch (error) {
    console.error("Failed to load user:", error);
    currentUser = null;
  }
}

// 소켓 이벤트 리스너 설정
function setupSocketListeners() {
  // 연결 이벤트
  socket.on("connect", () => {
    console.log("Connected to server!");
    
    // 로그인한 사용자라면 소켓에 사용자 ID 설정
    if (currentUser && currentUser.id) {
      socket.emit("set_user_id", { userId: currentUser.id });
      console.log(`Sent user ID to server: ${currentUser.id}`);
    }
  });

  // 핑-퐁 테스트
  socket.emit("ping");
  socket.on("pong", () => {
    console.log("Received pong from server!");
  });
}

// 게임 기록 가져오기
async function loadGameHistory(limit = 5): Promise<GameHistoryItem[]> {
  if (!currentUser) return [];
  
  try {
    return await gameService.getGameHistory(limit);
  } catch (error) {
    console.error("Failed to load game history:", error);
    return [];
  }
}

// 메인 페이지 HTML 생성
export function renderHomePage(): string {
  return `
    <div class="main-content-wrapper">
      <div class="main-content">
        <div class="pong-container text-center">
          <h1 class="pong-title cursor-pointer">PONG</h1>
          
          <div class="buttons-container">
            <button id="local-game-btn" class="btn">LOCAL GAME</button>
            <button id="multiplayer-btn" class="btn">MULTIPLAYER</button>
            <button id="team-game-btn" class="btn">TEAM GAME</button>
            ${currentUser ? 
              `<button id="profile-btn" class="btn">PROFILE</button>
               <button id="logout-btn" class="btn">LOGOUT</button>` : 
              `<button id="login-btn" class="btn">LOGIN</button>`
            }
          </div>
          
          <div class="text-container welcome-text">
            <p>Welcome to the ft_transcendence Pong Game!</p>
            <p class="mt-2">A modern implementation of the classic game.</p>
          </div>
          
          ${currentUser ? 
            `<div class="user-info-container">
              <p class="mt-4">Logged in as: <strong>${currentUser.displayName}</strong></p>
              <div id="game-history" class="mt-4">
                <h3>Recent Games</h3>
                <div id="history-content" class="mt-2">
                  <p>Loading game history...</p>
                </div>
              </div>
            </div>` : 
            ""}
          
          <div class="game-content-wrapper">
            <div></div> <!-- 왼쪽 공간 -->
            <div id="game-container" class="bg-black">
              <!-- 게임 캔버스가 여기에 렌더링됩니다 -->
            </div>
            <div></div> <!-- 오른쪽 공간 -->
          </div>
        </div>
      </div>
    </div>
  `;
}

// 메인 페이지 초기화
export async function initHomePage(): Promise<void> {
  // 사용자 정보 로드
  await loadUser();
  
  // 소켓 이벤트 리스너 설정
  setupSocketListeners();
  
  // 이벤트 리스너 등록
  setupEventListeners();
  
  // 게임 기록 로드 (로그인한 경우)
  if (currentUser) {
    const historyContainer = document.getElementById("history-content");
    if (historyContainer) {
      const gameHistory = await loadGameHistory();
      
      if (gameHistory.length === 0) {
        historyContainer.innerHTML = "<p>No game history yet.</p>";
      } else {
        historyContainer.innerHTML = `
          <table class="game-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Opponent</th>
                <th>Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              ${gameHistory.map(game => {
                const isPlayer1 = game.player1Name === currentUser.displayName;
                const opponentName = isPlayer1 ? game.player2Name : game.player1Name;
                const userScore = isPlayer1 ? game.player1Score : game.player2Score;
                const opponentScore = isPlayer1 ? game.player2Score : game.player1Score;
                const result = game.winnerName === currentUser.displayName ? "Win" : "Loss";
                
                return `
                  <tr>
                    <td>${new Date(game.gameDate).toLocaleDateString()}</td>
                    <td>${opponentName}</td>
                    <td>${userScore} - ${opponentScore}</td>
                    <td class="${result === 'Win' ? 'win' : 'loss'}">${result}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }
    }
  }
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // PONG 로고 클릭 이벤트
  const pongTitle = document.querySelector(".pong-title");
  if (pongTitle) {
    pongTitle.addEventListener("click", () => {
      // 현재 게임이 있으면 종료
      if (game) {
        game.destroy();
        game = null;
      }
      // 게임 모드 클래스 제거
      const pongContainer = document.querySelector(".pong-container");
      if (pongContainer) {
        pongContainer.classList.remove("game-mode");
      }
      router.navigate('/');
    });
  }

  // 버튼 이벤트 리스너
  const localGameBtn = document.getElementById("local-game-btn");
  const multiplayerBtn = document.getElementById("multiplayer-btn");
  const teamGameBtn = document.getElementById("team-game-btn");
  const loginBtn = document.getElementById("login-btn");
  const profileBtn = document.getElementById("profile-btn");

  if (localGameBtn) {
    localGameBtn.addEventListener("click", () => {
      if (game) {
        game.destroy();
        game = null;
      }
      // 게임 모드 클래스 추가
      const pongContainer = document.querySelector(".pong-container");
      if (pongContainer) {
        pongContainer.classList.add("game-mode");
      }
      game = new Game("game-container", 'local');
    });
  }
  
  if (multiplayerBtn) {
    multiplayerBtn.addEventListener("click", () => {
      // 로그인 검사 추가
      if (!currentUser) {
        alert("Please login to play multiplayer mode.");
        return;
      }
      
      if (game) {
        game.destroy();
        game = null;
      }
      // 게임 모드 클래스 추가
      const pongContainer = document.querySelector(".pong-container");
      if (pongContainer) {
        pongContainer.classList.add("game-mode");
      }
      // 일반 멀티플레이어 모드 (2인)
      maxPlayers = 2;
      isMultiTeam = false;
      game = new Game("game-container", 'multiplayer');
      game.joinGame(); // 게임 참가
    });
  }
  
  if (teamGameBtn) {
    teamGameBtn.addEventListener("click", () => {
      // 로그인 검사 추가
      if (!currentUser) {
        alert("Please login to play team game mode.");
        return;
      }
      
      if (game) {
        game.destroy();
        game = null;
      }
      // 게임 모드 클래스 추가
      const pongContainer = document.querySelector(".pong-container");
      if (pongContainer) {
        pongContainer.classList.add("game-mode");
      }
      // 팀 모드 (3인 이상 가능)
      maxPlayers = 0; // 무제한
      isMultiTeam = true;
      game = new Game("game-container", 'multiteam');
      
      // 멀티팀 게임 참가
      fetch(`${API_URL}/api/game/multiteam`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.gameId) {
          game?.joinGame(data.gameId);
        }
      })
      .catch(err => {
        console.error('Error joining multiteam game:', err);
      });
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      window.location.href = authService.getGoogleLoginUrl();
    });
  }
  
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      if (currentUser) {
        router.navigate(`/users/${currentUser.id}`);
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      window.location.href = authService.getLogoutUrl();
    });
  }
}

// 게임 종료 이벤트 핸들러
document.addEventListener('game-exit', () => {
  if (game) {
    game.destroy();
    game = null;
  }
  
  const pongContainer = document.querySelector(".pong-container");
  if (pongContainer) {
    pongContainer.classList.remove("game-mode");
  }
});
