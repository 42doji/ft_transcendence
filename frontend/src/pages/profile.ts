import { router } from '../services/router';
import { authService } from '../services/api';
import { userService, UserProfile, Friend } from '../services/user';
import { gameService, GameHistoryItem, GameStats } from '../services/game';

// 현재 사용자 정보
let currentUser: any = null;
// 프로필 사용자 정보
let profileUser: UserProfile | null = null;
// 친구 목록
let friends: Friend[] = [];
// 게임 통계
let gameStats: GameStats | null = null;
// 게임 기록
let gameHistory: GameHistoryItem[] = [];

// 사용자 정보 로드
export async function loadUser() {
  try {
    currentUser = await authService.getMe();
    console.log("Current user:", currentUser);
  } catch (error) {
    console.error("Failed to load user:", error);
    currentUser = null;
  }
}

// 프로필 페이지 HTML 생성
export function renderProfilePage(params: Record<string, string> = {}): string {
  const userId = params.userId || '';
  
  return `
    <div class="main-content-wrapper">
      <div class="main-content">
        <div class="profile-container">
          <div class="profile-header">
            <h1 class="profile-title">User Profile</h1>
            <button id="back-to-home" class="btn">Back to Home</button>
          </div>
          
          <div id="profile-loading" class="loading-container">
            <p>Loading profile...</p>
          </div>
          
          <div id="profile-content" class="hidden">
            <div class="profile-info-container">
              <div class="profile-avatar">
                <img id="profile-image" src="" alt="Profile Image">
              </div>
              <div class="profile-details">
                <h2 id="profile-name">...</h2>
                <p id="profile-status">...</p>
                <p id="profile-bio">...</p>
                
                <div id="friend-actions" class="friend-actions hidden">
                  <button id="add-friend-btn" class="btn">Add Friend</button>
                  <button id="remove-friend-btn" class="btn hidden">Remove Friend</button>
                  <button id="block-user-btn" class="btn">Block User</button>
                </div>
              </div>
            </div>
            
            <div class="profile-tabs">
              <button id="tab-stats" class="tab-btn active">Game Stats</button>
              <button id="tab-history" class="tab-btn">Game History</button>
              <button id="tab-friends" class="tab-btn">Friends</button>
            </div>
            
            <div id="tab-content" class="tab-content">
              <!-- 탭 내용이 여기에 로드됩니다 -->
              <div id="stats-content" class="tab-pane active">
                <div class="stats-container">
                  <div class="stats-item">
                    <h3>Total Games</h3>
                    <p id="stats-total">0</p>
                  </div>
                  <div class="stats-item">
                    <h3>Wins</h3>
                    <p id="stats-wins">0</p>
                  </div>
                  <div class="stats-item">
                    <h3>Losses</h3>
                    <p id="stats-losses">0</p>
                  </div>
                  <div class="stats-item">
                    <h3>Win Rate</h3>
                    <p id="stats-winrate">0%</p>
                  </div>
                </div>
              </div>
              
              <div id="history-content" class="tab-pane">
                <p>Loading game history...</p>
              </div>
              
              <div id="friends-content" class="tab-pane">
                <p>Loading friends...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 프로필 페이지 초기화
export async function initProfilePage(params: Record<string, string> = {}): Promise<void> {
  const userId = params.userId || '';
  
  // 사용자 정보 로드
  await loadUser();
  
  // 프로필 사용자 정보 로드
  try {
    profileUser = await userService.getUserProfile(parseInt(userId));
    
    // 프로필 UI 업데이트
    updateProfileUI();
    
    // 프로필이 현재 사용자인지 확인
    const isCurrentUser = currentUser && currentUser.id === parseInt(userId);
    
    // 친구 액션 버튼 표시 여부
    const friendActions = document.getElementById('friend-actions');
    if (friendActions) {
      if (isCurrentUser) {
        friendActions.classList.add('hidden');
      } else {
        friendActions.classList.remove('hidden');
        
        // 친구 관계 확인
        if (currentUser) {
          try {
            const friendsList = await userService.getFriends();
            friends = friendsList;
            
            const isFriend = friends.some(friend => friend.id === parseInt(userId));
            const addFriendBtn = document.getElementById('add-friend-btn');
            const removeFriendBtn = document.getElementById('remove-friend-btn');
            
            if (addFriendBtn && removeFriendBtn) {
              if (isFriend) {
                addFriendBtn.classList.add('hidden');
                removeFriendBtn.classList.remove('hidden');
              } else {
                addFriendBtn.classList.remove('hidden');
                removeFriendBtn.classList.add('hidden');
              }
            }
          } catch (error) {
            console.error('Failed to load friends:', error);
          }
        }
      }
    }
    
    // 게임 통계 로드
    if (isCurrentUser) {
      try {
        gameStats = await gameService.getUserStats();
        updateStatsUI();
      } catch (error) {
        console.error('Failed to load game stats:', error);
      }
    }
    
    // 게임 기록 로드
    try {
      gameHistory = await gameService.getGameHistory(10);
      updateHistoryUI();
    } catch (error) {
      console.error('Failed to load game history:', error);
    }
    
    // 친구 목록 로드
    if (isCurrentUser) {
      updateFriendsUI();
    }
    
    // 탭 이벤트 리스너 등록
    setupTabListeners();
    
    // 버튼 이벤트 리스너 등록
    setupButtonListeners(isCurrentUser, parseInt(userId));
    
    // 로딩 상태 숨기기
    const loadingContainer = document.getElementById('profile-loading');
    const profileContent = document.getElementById('profile-content');
    
    if (loadingContainer && profileContent) {
      loadingContainer.classList.add('hidden');
      profileContent.classList.remove('hidden');
    }
  } catch (error) {
    console.error(`Failed to load profile for user with ID ${userId}:`, error);
    
    // 오류 메시지 표시
    const loadingContainer = document.getElementById('profile-loading');
    if (loadingContainer) {
      loadingContainer.innerHTML = '<p>Failed to load profile. User not found or an error occurred.</p>';
    }
  }
}

// 프로필 UI 업데이트
function updateProfileUI(): void {
  if (!profileUser) return;
  
  // 프로필 이미지
  const profileImage = document.getElementById('profile-image') as HTMLImageElement;
  if (profileImage) {
    profileImage.src = profileUser.profileImage || 'https://via.placeholder.com/100';
    profileImage.alt = `${profileUser.displayName}'s Profile`;
  }
  
  // 프로필 이름
  const profileName = document.getElementById('profile-name');
  if (profileName) {
    profileName.textContent = profileUser.displayName;
  }
  
  // 프로필 상태
  const profileStatus = document.getElementById('profile-status');
  if (profileStatus) {
    profileStatus.textContent = `Status: ${profileUser.status || 'Offline'}`;
  }
  
  // 프로필 소개
  const profileBio = document.getElementById('profile-bio');
  if (profileBio) {
    profileBio.textContent = profileUser.bio || 'No bio available.';
  }
}

// 게임 통계 UI 업데이트
function updateStatsUI(): void {
  if (!gameStats) return;
  
  // 총 게임 수
  const statsTotal = document.getElementById('stats-total');
  if (statsTotal) {
    statsTotal.textContent = gameStats.totalGames.toString();
  }
  
  // 승리 수
  const statsWins = document.getElementById('stats-wins');
  if (statsWins) {
    statsWins.textContent = gameStats.wins.toString();
  }
  
  // 패배 수
  const statsLosses = document.getElementById('stats-losses');
  if (statsLosses) {
    statsLosses.textContent = gameStats.losses.toString();
  }
  
  // 승률
  const statsWinrate = document.getElementById('stats-winrate');
  if (statsWinrate) {
    const winRate = gameStats.totalGames > 0 
      ? Math.round((gameStats.wins / gameStats.totalGames) * 100) 
      : 0;
    
    statsWinrate.textContent = `${winRate}%`;
  }
}

// 게임 기록 UI 업데이트
function updateHistoryUI(): void {
  const historyContent = document.getElementById('history-content');
  if (!historyContent) return;
  
  if (gameHistory.length === 0) {
    historyContent.innerHTML = '<p>No game history available.</p>';
    return;
  }
  
  historyContent.innerHTML = `
    <table class="game-history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Players</th>
          <th>Score</th>
          <th>Winner</th>
        </tr>
      </thead>
      <tbody>
        ${gameHistory.map(game => `
          <tr>
            <td>${new Date(game.gameDate).toLocaleDateString()}</td>
            <td>${game.player1Name} vs ${game.player2Name}</td>
            <td>${game.player1Score} - ${game.player2Score}</td>
            <td>${game.winnerName}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// 친구 목록 UI 업데이트
function updateFriendsUI(): void {
  const friendsContent = document.getElementById('friends-content');
  if (!friendsContent) return;
  
  if (friends.length === 0) {
    friendsContent.innerHTML = '<p>No friends yet.</p>';
    return;
  }
  
  friendsContent.innerHTML = `
    <div class="friends-list">
      ${friends.map(friend => `
        <div class="friend-item">
          <img src="${friend.profileImage || 'https://via.placeholder.com/50'}" alt="${friend.displayName}" class="friend-avatar">
          <div class="friend-info">
            <h3 class="friend-name">${friend.displayName}</h3>
            <p class="friend-status">${friend.status || 'Offline'}</p>
          </div>
          <div class="friend-actions">
            <button class="btn view-profile-btn" data-id="${friend.id}">View Profile</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
  
  // 프로필 보기 버튼 이벤트 리스너
  const viewProfileBtns = friendsContent.querySelectorAll('.view-profile-btn');
  viewProfileBtns.forEach(btn => {
    btn.addEventListener('click', (event) => {
      const friendId = (event.target as HTMLElement).getAttribute('data-id');
      if (friendId) {
        router.navigate(`/users/${friendId}`);
      }
    });
  });
}

// 탭 이벤트 리스너 설정
function setupTabListeners(): void {
  // 탭 버튼
  const tabStats = document.getElementById('tab-stats');
  const tabHistory = document.getElementById('tab-history');
  const tabFriends = document.getElementById('tab-friends');
  
  // 탭 내용
  const statsContent = document.getElementById('stats-content');
  const historyContent = document.getElementById('history-content');
  const friendsContent = document.getElementById('friends-content');
  
  if (tabStats && tabHistory && tabFriends && statsContent && historyContent && friendsContent) {
    // 통계 탭 클릭
    tabStats.addEventListener('click', () => {
      // 활성 탭 변경
      tabStats.classList.add('active');
      tabHistory.classList.remove('active');
      tabFriends.classList.remove('active');
      
      // 탭 내용 변경
      statsContent.classList.add('active');
      historyContent.classList.remove('active');
      friendsContent.classList.remove('active');
    });
    
    // 기록 탭 클릭
    tabHistory.addEventListener('click', () => {
      // 활성 탭 변경
      tabStats.classList.remove('active');
      tabHistory.classList.add('active');
      tabFriends.classList.remove('active');
      
      // 탭 내용 변경
      statsContent.classList.remove('active');
      historyContent.classList.add('active');
      friendsContent.classList.remove('active');
    });
    
    // 친구 탭 클릭
    tabFriends.addEventListener('click', () => {
      // 활성 탭 변경
      tabStats.classList.remove('active');
      tabHistory.classList.remove('active');
      tabFriends.classList.add('active');
      
      // 탭 내용 변경
      statsContent.classList.remove('active');
      historyContent.classList.remove('active');
      friendsContent.classList.add('active');
    });
  }
}

// 버튼 이벤트 리스너 설정
function setupButtonListeners(isCurrentUser: boolean, userId: number): void {
  // 뒤로 가기 버튼
  const backBtn = document.getElementById('back-to-home');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      router.navigate('/');
    });
  }
  
  // 친구 추가/삭제/차단 버튼 (자신의 프로필이 아닌 경우만)
  if (!isCurrentUser) {
    // 친구 추가 버튼
    const addFriendBtn = document.getElementById('add-friend-btn');
    if (addFriendBtn) {
      addFriendBtn.addEventListener('click', async () => {
        if (!currentUser) {
          alert('You must be logged in to add friends.');
          return;
        }
        
        try {
          await userService.sendFriendRequest(userId);
          alert('Friend request sent successfully!');
          
          // 버튼 상태 업데이트
          addFriendBtn.classList.add('hidden');
          
          const removeFriendBtn = document.getElementById('remove-friend-btn');
          if (removeFriendBtn) {
            removeFriendBtn.classList.remove('hidden');
          }
        } catch (error) {
          console.error('Failed to send friend request:', error);
          alert('Failed to send friend request. Please try again later.');
        }
      });
    }
    
    // 친구 삭제 버튼
    const removeFriendBtn = document.getElementById('remove-friend-btn');
    if (removeFriendBtn) {
      removeFriendBtn.addEventListener('click', async () => {
        if (!currentUser) {
          alert('You must be logged in to remove friends.');
          return;
        }
        
        try {
          await userService.removeFriend(userId);
          alert('Friend removed successfully!');
          
          // 버튼 상태 업데이트
          removeFriendBtn.classList.add('hidden');
          
          const addFriendBtn = document.getElementById('add-friend-btn');
          if (addFriendBtn) {
            addFriendBtn.classList.remove('hidden');
          }
        } catch (error) {
          console.error('Failed to remove friend:', error);
          alert('Failed to remove friend. Please try again later.');
        }
      });
    }
    
    // 사용자 차단 버튼
    const blockUserBtn = document.getElementById('block-user-btn');
    if (blockUserBtn) {
      blockUserBtn.addEventListener('click', async () => {
        if (!currentUser) {
          alert('You must be logged in to block users.');
          return;
        }
        
        const confirmBlock = confirm('Are you sure you want to block this user?');
        if (!confirmBlock) return;
        
        try {
          await userService.blockUser(userId);
          alert('User blocked successfully!');
          
          // 메인 페이지로 이동
          router.navigate('/');
        } catch (error) {
          console.error('Failed to block user:', error);
          alert('Failed to block user. Please try again later.');
        }
      });
    }
  }
}
