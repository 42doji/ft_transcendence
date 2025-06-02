// 간단한 SPA 라우터 구현
export type Route = {
  path: string;
  component: () => string;
  init?: () => void;
  params?: Record<string, string>;
};

class Router {
  private routes: Route[] = [];
  private currentRoute: Route | null = null;
  
  constructor() {
    window.addEventListener('popstate', this.handlePopState.bind(this));
  }
  
  // 라우트 등록
  register(path: string, component: () => string, init?: () => void): void {
    this.routes.push({ path, component, init });
  }
  
  // 특정 경로로 이동
  navigate(path: string): void {
    window.history.pushState(null, '', path);
    this.handlePopState();
  }
  
  // 현재 URL 경로에 맞는 라우트 찾기
  private handlePopState(): void {
    const path = window.location.pathname;
    
    // 사용자 프로필 경로 패턴 확인 (/users/:userId)
    const userProfileMatch = path.match(/^\/users\/([^\/]+)$/);
    if (userProfileMatch) {
      const route = this.routes.find(r => r.path === '/users/:userId');
      if (route) {
        const clonedRoute = { ...route, params: { userId: userProfileMatch[1] } };
        this.currentRoute = clonedRoute;
        this.renderRoute();
        return;
      }
    }
    
    // 일반 경로 확인
    const route = this.routes.find(r => r.path === path);
    if (route) {
      this.currentRoute = route;
      this.renderRoute();
    } else {
      // 일치하는 라우트가 없으면 첫 번째 라우트로 리다이렉션
      if (this.routes.length > 0) {
        window.history.replaceState(null, '', this.routes[0].path);
        this.currentRoute = this.routes[0];
        this.renderRoute();
      }
    }
  }
  
  // 현재 라우트 렌더링
  private renderRoute(): void {
    if (!this.currentRoute) return;
    
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = this.currentRoute.component();
      // 라우트에 초기화 함수가 있으면 실행
      if (this.currentRoute.init) {
        this.currentRoute.init();
      }
    }
  }
  
  // 라우터 초기화 (첫 페이지 로드)
  init(): void {
    this.handlePopState();
  }
}

export const router = new Router();
