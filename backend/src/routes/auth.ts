import { FastifyInstance } from "fastify";
import fastifyPassport from "@fastify/passport";

export default async function authRoutes(server: FastifyInstance) {
  // Google 로그인 시작
  server.get("/google", {
    preValidation: (request, reply, done) => {
      console.log('Starting Google OAuth flow');
      fastifyPassport.authenticate("google", {
        scope: ["profile", "email"]
      })(request, reply, done);
    }
  }, () => {});

  // Google 콜백
  server.get("/google/callback", {
    preValidation: fastifyPassport.authenticate("google", {
      failureRedirect: "http://localhost:3000/login?error=auth_failed"
    })
  }, async (request, reply) => {
    // 로그인 성공, 프론트엔드로 리디렉션
    reply.redirect("http://localhost:3000");
  });

  // 로그아웃
  server.get("/logout", async (request, reply) => {
    request.logOut();
    reply.redirect("http://localhost:3000");
  });

  // 현재 사용자 정보
  server.get("/me", async (request, reply) => {
    if (request.isAuthenticated()) {
      return reply.send({ user: request.user });
    }
    return reply.status(401).send({ message: "Not authenticated" });
  });
}
