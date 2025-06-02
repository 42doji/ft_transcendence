import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 데이터베이스 파일 경로
const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || path.join(process.cwd(), '../database/db.sqlite');

// 데이터베이스 디렉토리 생성
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 데이터베이스 연결
export const db = new Database(dbPath);

// 사용자 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    googleId TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    displayName TEXT NOT NULL,
    profileImage TEXT,
    status TEXT DEFAULT 'offline',
    bio TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    lastLogin DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 세션 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire DATETIME NOT NULL
  )
`);

// 게임 기록 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS game_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gameId TEXT NOT NULL,
    player1Id INTEGER,
    player2Id INTEGER,
    player1Score INTEGER DEFAULT 0,
    player2Score INTEGER DEFAULT 0,
    winnerId INTEGER,
    gameDate DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1Id) REFERENCES users(id),
    FOREIGN KEY (player2Id) REFERENCES users(id),
    FOREIGN KEY (winnerId) REFERENCES users(id)
  )
`);

// 사용자 역할 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id)
  )
`);

// 리프레시 토큰 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

// 데이터베이스 마이그레이션: 누락된 컬럼 추가
// status 컬럼 추가
try {
  db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'offline'`);
  console.log('Migration: Added status column to users table');
} catch (error) {
  // 이미 컬럼이 존재하는 경우 오류 무시
  if (!(error.message && error.message.includes('duplicate column name'))) {
    console.error('Error during migration (status):', error);
  }
}

// bio 컬럼 추가
try {
  db.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
  console.log('Migration: Added bio column to users table');
} catch (error) {
  // 이미 컬럼이 존재하는 경우 오류 무시
  if (!(error.message && error.message.includes('duplicate column name'))) {
    console.error('Error during migration (bio):', error);
  }
}

// 추가 마이그레이션을 위한 모든 필요한 컬럼 추가
const columnsToAdd = [
  { name: 'profileImage', type: 'TEXT' },
  { name: 'createdAt', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { name: 'lastLogin', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
];

for (const column of columnsToAdd) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
    console.log(`Migration: Added ${column.name} column to users table`);
  } catch (error) {
    // 이미 컬럼이 존재하는 경우 오류 무시
    if (!(error.message && error.message.includes('duplicate column name'))) {
      console.error(`Error during migration (${column.name}):`, error);
    }
  }
}

// 친구 관계 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'blocked'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id),
    UNIQUE(user_id, friend_id)
  )
`);

// 사용자 관련 쿼리
export const queries = {
  // 사용자 관리 쿼리
  findUserByGoogleId: db.prepare("SELECT * FROM users WHERE googleId = ?"),
  findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
  findUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  findUserByDisplayName: db.prepare("SELECT * FROM users WHERE displayName = ?"),
  searchUsersByDisplayName: db.prepare("SELECT * FROM users WHERE displayName LIKE ? LIMIT ?"),
  createUser: db.prepare(`
    INSERT INTO users (googleId, email, displayName, profileImage) 
    VALUES (@googleId, @email, @displayName, @profileImage)
  `),
  updateLastLogin: db.prepare(`
    UPDATE users SET lastLogin = CURRENT_TIMESTAMP WHERE id = ?
  `),
  updateUserStatus: db.prepare(`
    UPDATE users SET status = ? WHERE id = ?
  `),
  updateUserProfile: db.prepare(`
    UPDATE users SET displayName = ?, bio = ?, profileImage = ? WHERE id = ?
  `),
  
  // 게임 기록 관련 쿼리
  saveGameRecord: db.prepare(`
    INSERT INTO game_records (gameId, player1Id, player2Id, player1Score, player2Score, winnerId)
    VALUES (@gameId, @player1Id, @player2Id, @player1Score, @player2Score, @winnerId)
  `),
  getGameHistory: db.prepare(`
    SELECT * FROM game_records WHERE player1Id = ? OR player2Id = ? ORDER BY gameDate DESC LIMIT ?
  `),
  getUserStats: db.prepare(`
    SELECT 
      COUNT(CASE WHEN winnerId = ? THEN 1 END) as wins,
      COUNT(CASE WHEN (player1Id = ? OR player2Id = ?) AND winnerId != ? THEN 1 END) as losses,
      COUNT(*) as totalGames
    FROM game_records
    WHERE player1Id = ? OR player2Id = ?
  `),
  
  // 사용자 역할 관련 쿼리
  getUserRole: db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ?
  `),
  setUserRole: db.prepare(`
    INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)
  `),
  
  // 리프레시 토큰 관련 쿼리
  saveRefreshToken: db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_id, expires_at) VALUES (?, ?, ?)
  `),
  getRefreshToken: db.prepare(`
    SELECT * FROM refresh_tokens WHERE user_id = ? AND token_id = ? AND expires_at > datetime('now')
  `),
  deleteRefreshToken: db.prepare(`
    DELETE FROM refresh_tokens WHERE user_id = ? AND token_id = ?
  `),
  deleteAllRefreshTokens: db.prepare(`
    DELETE FROM refresh_tokens WHERE user_id = ?
  `),
  cleanExpiredTokens: db.prepare(`
    DELETE FROM refresh_tokens WHERE expires_at < datetime('now')
  `),
  
  // 친구 관계 관련 쿼리
  addFriendRequest: db.prepare(`
    INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')
  `),
  acceptFriendRequest: db.prepare(`
    UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND friend_id = ?
  `),
  rejectFriendRequest: db.prepare(`
    DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'
  `),
  blockUser: db.prepare(`
    INSERT OR REPLACE INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'blocked')
  `),
  unblockUser: db.prepare(`
    DELETE FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'blocked'
  `),
  removeFriend: db.prepare(`
    DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `),
  getFriendRequests: db.prepare(`
    SELECT f.id, f.user_id, f.friend_id, f.status, f.created_at, u.displayName, u.profileImage
    FROM friendships f
    JOIN users u ON f.user_id = u.id
    WHERE f.friend_id = ? AND f.status = 'pending'
  `),
  getFriends: db.prepare(`
    SELECT u.id, u.displayName, u.email, u.profileImage, u.status, u.bio, f.status as friendship_status
    FROM users u
    JOIN friendships f ON (f.friend_id = u.id OR f.user_id = u.id)
    WHERE ((f.user_id = ? AND f.friend_id = u.id) OR (f.friend_id = ? AND f.user_id = u.id))
    AND f.status = 'accepted'
  `),
  getBlockedUsers: db.prepare(`
    SELECT u.id, u.displayName, u.email, u.profileImage
    FROM users u
    JOIN friendships f ON f.friend_id = u.id
    WHERE f.user_id = ? AND f.status = 'blocked'
  `),
  getFriendshipStatus: db.prepare(`
    SELECT * FROM friendships
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `)
};
