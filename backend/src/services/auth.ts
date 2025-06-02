import jwt from 'jsonwebtoken';
import { db, queries } from '../database/database';

interface TokenPayload {
  userId: number;
  exp?: number;
}

interface RefreshTokenPayload {
  userId: number;
  tokenId: string;
  exp?: number;
}

export const authService = {
  /**
   * JWT 토큰 생성
   */
  generateTokens(userId: number) {
    const tokenSecret = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
    const tokenExpiry = 60 * 60; // 1시간
    const refreshTokenExpiry = 30 * 24 * 60 * 60; // 30일
    
    // 고유한 토큰 ID 생성
    const tokenId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // 액세스 토큰 생성
    const accessToken = jwt.sign(
      { userId } as TokenPayload,
      tokenSecret,
      { expiresIn: tokenExpiry }
    );
    
    // 리프레시 토큰 생성
    const refreshToken = jwt.sign(
      { userId, tokenId } as RefreshTokenPayload,
      tokenSecret,
      { expiresIn: refreshTokenExpiry }
    );
    
    // 리프레시 토큰을 데이터베이스에 저장
    try {
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + refreshTokenExpiry);
      
      db.prepare(`
        INSERT INTO refresh_tokens (user_id, token_id, expires_at)
        VALUES (?, ?, ?)
      `).run(userId, tokenId, expiresAt.toISOString());
    } catch (error) {
      console.error('Error saving refresh token:', error);
    }
    
    return { accessToken, refreshToken };
  },
  
  /**
   * 리프레시 토큰을 사용하여 새로운
   * 액세스 토큰 발급
   */
  refreshAccessToken(refreshToken: string) {
    try {
      const tokenSecret = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';
      
      // 리프레시 토큰 검증
      const decoded = jwt.verify(refreshToken, tokenSecret) as RefreshTokenPayload;
      
      // 리프레시 토큰의 유효성 확인
      const tokenExists = db.prepare(`
        SELECT * FROM refresh_tokens 
        WHERE user_id = ? AND token_id = ? AND expires_at > datetime('now')
      `).get(decoded.userId, decoded.tokenId);
      
      if (!tokenExists) {
        throw new Error('Invalid refresh token');
      }
      
      // 새로운 액세스 토큰 발급
      const accessToken = jwt.sign(
        { userId: decoded.userId } as TokenPayload,
        tokenSecret,
        { expiresIn: 60 * 60 } // 1시간
      );
      
      return { accessToken };
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  },
  
  /**
   * 로그아웃 - 리프레시 토큰 무효화
   */
  async invalidateRefreshToken(userId: number, tokenId?: string) {
    try {
      if (tokenId) {
        // 특정 토큰만 무효화
        db.prepare(`
          DELETE FROM refresh_tokens 
          WHERE user_id = ? AND token_id = ?
        `).run(userId, tokenId);
      } else {
        // 사용자의 모든 토큰 무효화
        db.prepare(`
          DELETE FROM refresh_tokens 
          WHERE user_id = ?
        `).run(userId);
      }
      
      return true;
    } catch (error) {
      console.error('Error invalidating refresh token:', error);
      throw error;
    }
  },
  
  /**
   * 사용자 가져오기
   */
  getUserById(userId: number) {
    try {
      const user = db.prepare(`
        SELECT * FROM users 
        WHERE id = ?
      `).get(userId);
      
      return user;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  },
  
  /**
   * 사용자 정보 업데이트
   */
  updateUser(userId: number, updates: Record<string, any>) {
    try {
      // 업데이트할 필드 목록 생성
      const fields = Object.keys(updates)
        .filter(field => !['id', 'googleId', 'createdAt'].includes(field)) // 변경 불가능한 필드 제외
        .map(field => `${field} = ?`);
      
      if (fields.length === 0) {
        return null; // 업데이트할 내용 없음
      }
      
      // 업데이트 쿼리 실행
      const values = Object.keys(updates)
        .filter(field => !['id', 'googleId', 'createdAt'].includes(field))
        .map(field => updates[field]);
      
      values.push(userId); // WHERE 절의 userId
      
      const updateQuery = `
        UPDATE users 
        SET ${fields.join(', ')} 
        WHERE id = ?
      `;
      
      db.prepare(updateQuery).run(...values);
      
      // 업데이트된 사용자 정보 반환
      return this.getUserById(userId);
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },
  
  /**
   * 사용자 역할 확인
   */
  getUserRole(userId: number) {
    try {
      const role = db.prepare(`
        SELECT role FROM user_roles 
        WHERE user_id = ?
      `).get(userId);
      
      return role ? role.role : 'user'; // 기본 역할은 'user'
    } catch (error) {
      console.error('Error fetching user role:', error);
      return 'user'; // 오류 시 기본 역할 반환
    }
  },
  
  /**
   * 권한 확인
   */
  hasPermission(userId: number, requiredRole: string) {
    const userRole = this.getUserRole(userId);
    
    // 간단한 역할 기반 권한 체크 
    // (실제로는 더 복잡한 권한 모델을 사용할 수 있음)
    if (userRole === 'admin') return true; // 관리자는 모든 권한 가짐
    if (userRole === requiredRole) return true; // 필요한 역할과 일치
    
    return false;
  }
};
