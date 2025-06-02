import "./styles/main.css";
import "./styles/profile.css";
import { router } from "./services/router";
import { renderHomePage, initHomePage } from "./pages/home";
import { renderProfilePage, initProfilePage } from "./pages/profile";

// DOM 요소
const app = document.getElementById("app");

// 라우터 설정
function setupRouter() {
  // 메인 페이지 경로 등록
  router.register('/', renderHomePage, initHomePage);
  
  // 프로필 페이지 경로 등록
  router.register('/users/:userId', renderProfilePage, initProfilePage);
  
  // 라우터 초기화
  router.init();
}

// 초기 설정
setupRouter();

// HMR 모듈 교체 지원
if (import.meta.hot) {
  import.meta.hot.accept();
}
