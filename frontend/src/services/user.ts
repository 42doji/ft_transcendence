import { api } from './api';

export interface UserProfile {
  id: number;
  displayName: string;
  email: string;
  profileImage: string;
  status: string;
  bio: string;
}

export interface FriendRequest {
  id: number;
  user_id: number;
  friend_id: number;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  displayName: string;
  profileImage: string;
}

export interface Friend {
  id: number;
  displayName: string;
  email: string;
  profileImage: string;
  status: string;
  bio: string;
  friendship_status: 'accepted' | 'pending' | 'blocked';
}

export const userService = {
  // 사용자 프로필 정보 가져오기
  async getUserProfile(userId: number): Promise<UserProfile> {
    try {
      const response = await api.get(`/api/users/${userId}`);
      return response.data.user;
    } catch (error) {
      console.error(`Error fetching user with ID ${userId}:`, error);
      throw error;
    }
  },
  
  // 사용자 친구 목록 가져오기
  async getFriends(): Promise<Friend[]> {
    try {
      const response = await api.get('/api/users/friends');
      return response.data.friends;
    } catch (error) {
      console.error('Error fetching friends:', error);
      throw error;
    }
  },
  
  // 사용자 친구 요청 목록 가져오기
  async getFriendRequests(): Promise<FriendRequest[]> {
    try {
      const response = await api.get('/api/users/friend-requests');
      return response.data.requests;
    } catch (error) {
      console.error('Error fetching friend requests:', error);
      throw error;
    }
  },
  
  // 친구 요청 보내기
  async sendFriendRequest(friendId: number): Promise<void> {
    try {
      await api.post('/api/users/friend-requests', { friendId });
    } catch (error) {
      console.error('Error sending friend request:', error);
      throw error;
    }
  },
  
  // 친구 요청 수락하기
  async acceptFriendRequest(requestId: number): Promise<void> {
    try {
      await api.post(`/api/users/friend-requests/${requestId}/accept`);
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  },
  
  // 친구 요청 거절하기
  async rejectFriendRequest(requestId: number): Promise<void> {
    try {
      await api.post(`/api/users/friend-requests/${requestId}/reject`);
    } catch (error) {
      console.error('Error rejecting friend request:', error);
      throw error;
    }
  },
  
  // 친구 삭제하기
  async removeFriend(friendId: number): Promise<void> {
    try {
      await api.delete(`/api/users/friends/${friendId}`);
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  },
  
  // 사용자 차단하기
  async blockUser(userId: number): Promise<void> {
    try {
      await api.post(`/api/users/${userId}/block`);
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  },
  
  // 사용자 차단 해제하기
  async unblockUser(userId: number): Promise<void> {
    try {
      await api.post(`/api/users/${userId}/unblock`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  },
  
  // 사용자 프로필 업데이트
  async updateProfile(displayName: string, bio: string): Promise<UserProfile> {
    try {
      const response = await api.put('/api/users/profile', { displayName, bio });
      return response.data.user;
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }
};
