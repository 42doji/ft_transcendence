import { FastifyInstance } from "fastify";
import { db, queries } from "../../database/database";

export default async function userRoutes(server: FastifyInstance) {
  // 현재 사용자 프로필 가져오기
  server.get("/profile", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    return { success: true, user };
  });
  
  // 사용자 프로필 가져오기
  server.get("/:userId", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    
    try {
      const user = queries.findUserById.get(parseInt(userId));
      
      if (!user) {
        return reply.status(404).send({ success: false, message: "User not found" });
      }
      
      // 민감한 정보 제외
      const { googleId, email, ...safeUserData } = user;
      
      return { success: true, user: safeUserData };
    } catch (error) {
      server.log.error(`Error fetching user with ID ${userId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to fetch user" });
    }
  });
  
  // 사용자 프로필 업데이트
  server.put("/profile", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { displayName, bio } = request.body as { displayName: string; bio: string };
    
    try {
      // 중복 표시 이름 확인
      if (displayName !== user.displayName) {
        const existingUser = queries.findUserByDisplayName.get(displayName);
        if (existingUser) {
          return reply.status(400).send({ success: false, message: "Display name already in use" });
        }
      }
      
      // 프로필 업데이트
      queries.updateUserProfile.run(displayName, bio, user.profileImage, user.id);
      
      // 업데이트된 사용자 정보 반환
      const updatedUser = queries.findUserById.get(user.id);
      
      return { success: true, user: updatedUser };
    } catch (error) {
      server.log.error(`Error updating profile for user with ID ${user.id}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to update profile" });
    }
  });
  
  // 친구 목록 가져오기
  server.get("/friends", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    
    try {
      const friends = queries.getFriends.all(user.id, user.id);
      return { success: true, friends };
    } catch (error) {
      server.log.error(`Error fetching friends for user with ID ${user.id}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to fetch friends" });
    }
  });
  
  // 친구 요청 목록 가져오기
  server.get("/friend-requests", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    
    try {
      const requests = queries.getFriendRequests.all(user.id);
      return { success: true, requests };
    } catch (error) {
      server.log.error(`Error fetching friend requests for user with ID ${user.id}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to fetch friend requests" });
    }
  });
  
  // 친구 요청 보내기
  server.post("/friend-requests", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { friendId } = request.body as { friendId: number };
    
    if (!friendId) {
      return reply.status(400).send({ success: false, message: "Friend ID is required" });
    }
    
    try {
      // 자기 자신에게 요청을 보내는지 확인
      if (user.id === friendId) {
        return reply.status(400).send({ success: false, message: "Cannot send friend request to yourself" });
      }
      
      // 친구가 존재하는지 확인
      const friend = queries.findUserById.get(friendId);
      if (!friend) {
        return reply.status(404).send({ success: false, message: "User not found" });
      }
      
      // 이미 친구인지 확인
      const existingFriendship = queries.getFriendshipStatus.get(user.id, friendId, friendId, user.id);
      if (existingFriendship) {
        if (existingFriendship.status === 'accepted') {
          return reply.status(400).send({ success: false, message: "Already friends with this user" });
        }
        if (existingFriendship.status === 'blocked' && existingFriendship.user_id === friendId) {
          return reply.status(400).send({ success: false, message: "Cannot send friend request" });
        }
        if (existingFriendship.status === 'pending' && existingFriendship.user_id === user.id) {
          return reply.status(400).send({ success: false, message: "Friend request already sent" });
        }
      }
      
      // 친구 요청 추가
      queries.addFriendRequest.run(user.id, friendId);
      
      return { success: true, message: "Friend request sent successfully" };
    } catch (error) {
      server.log.error(`Error sending friend request from user with ID ${user.id} to user with ID ${friendId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to send friend request" });
    }
  });
  
  // 친구 요청 수락
  server.post("/friend-requests/:requestId/accept", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { requestId } = request.params as { requestId: string };
    
    try {
      // 친구 요청 조회
      const requestInfo = db.prepare(`
        SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = 'pending'
      `).get(parseInt(requestId), user.id);
      
      if (!requestInfo) {
        return reply.status(404).send({ success: false, message: "Friend request not found" });
      }
      
      // 요청 수락
      queries.acceptFriendRequest.run(requestInfo.user_id, user.id);
      
      return { success: true, message: "Friend request accepted" };
    } catch (error) {
      server.log.error(`Error accepting friend request with ID ${requestId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to accept friend request" });
    }
  });
  
  // 친구 요청 거절
  server.post("/friend-requests/:requestId/reject", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { requestId } = request.params as { requestId: string };
    
    try {
      // 친구 요청 조회
      const requestInfo = db.prepare(`
        SELECT * FROM friendships WHERE id = ? AND friend_id = ? AND status = 'pending'
      `).get(parseInt(requestId), user.id);
      
      if (!requestInfo) {
        return reply.status(404).send({ success: false, message: "Friend request not found" });
      }
      
      // 요청 거절
      queries.rejectFriendRequest.run(requestInfo.user_id, user.id);
      
      return { success: true, message: "Friend request rejected" };
    } catch (error) {
      server.log.error(`Error rejecting friend request with ID ${requestId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to reject friend request" });
    }
  });
  
  // 친구 삭제
  server.delete("/friends/:friendId", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { friendId } = request.params as { friendId: string };
    
    try {
      // 친구 관계 조회
      const friendship = queries.getFriendshipStatus.get(user.id, parseInt(friendId), parseInt(friendId), user.id);
      
      if (!friendship || friendship.status !== 'accepted') {
        return reply.status(404).send({ success: false, message: "Friend relationship not found" });
      }
      
      // 친구 삭제
      queries.removeFriend.run(user.id, parseInt(friendId), parseInt(friendId), user.id);
      
      return { success: true, message: "Friend removed successfully" };
    } catch (error) {
      server.log.error(`Error removing friend with ID ${friendId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to remove friend" });
    }
  });
  
  // 사용자 차단
  server.post("/:userId/block", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { userId } = request.params as { userId: string };
    
    if (user.id === parseInt(userId)) {
      return reply.status(400).send({ success: false, message: "Cannot block yourself" });
    }
    
    try {
      // 먼저 기존 친구 관계 삭제
      queries.removeFriend.run(user.id, parseInt(userId), parseInt(userId), user.id);
      
      // 차단 관계 추가
      queries.blockUser.run(user.id, parseInt(userId));
      
      return { success: true, message: "User blocked successfully" };
    } catch (error) {
      server.log.error(`Error blocking user with ID ${userId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to block user" });
    }
  });
  
  // 사용자 차단 해제
  server.post("/:userId/unblock", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    const { userId } = request.params as { userId: string };
    
    try {
      // 차단 해제
      queries.unblockUser.run(user.id, parseInt(userId));
      
      return { success: true, message: "User unblocked successfully" };
    } catch (error) {
      server.log.error(`Error unblocking user with ID ${userId}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to unblock user" });
    }
  });
  
  // 차단된 사용자 목록 가져오기
  server.get("/blocked", async (request, reply) => {
    // 인증 확인
    if (!request.isAuthenticated()) {
      return reply.status(401).send({ success: false, message: "Authentication required" });
    }
    
    const user = request.user as any;
    
    try {
      const blockedUsers = queries.getBlockedUsers.all(user.id);
      return { success: true, blockedUsers };
    } catch (error) {
      server.log.error(`Error fetching blocked users for user with ID ${user.id}:`, error);
      return reply.status(500).send({ success: false, message: "Failed to fetch blocked users" });
    }
  });
}
