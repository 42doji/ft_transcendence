import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // 쿠키 전송을 위해 필요
});

export const authService = {
  // 현재 사용자 정보 가져오기
  async getMe() {
    try {
      const response = await api.get("/api/auth/me");
      return response.data.user;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        return null;
      }
      throw error;
    }
  },

  // Google 로그인 URL
  getGoogleLoginUrl() {
    return `${API_URL}/api/auth/google`;
  },

  // 로그아웃 URL
  getLogoutUrl() {
    return `${API_URL}/api/auth/logout`;
  }
};
