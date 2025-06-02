import { FastifyInstance } from "fastify";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, queries } from "../database/database";
import fastifyPassport from "@fastify/passport";

export async function setupAuth(server: FastifyInstance) {
  // Passport 플러그인 등록
  await server.register(fastifyPassport.initialize());
  await server.register(fastifyPassport.secureSession());

  // Google OAuth 전략 설정
  const passport = fastifyPassport;

  console.log('Google OAuth Config:', {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  });

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      // 사용자 찾기
      let user = queries.findUserByGoogleId.get(profile.id);

      if (!user) {
        // 새 사용자 생성
        const userInfo = {
          googleId: profile.id,
          email: profile.emails?.[0]?.value || '',
          displayName: profile.displayName,
          profileImage: profile.photos?.[0]?.value || ''
        };
        
        const result = queries.createUser.run(userInfo);
        user = queries.findUserByGoogleId.get(profile.id);
      } else {
        // 마지막 로그인 업데이트
        queries.updateLastLogin.run(user.id);
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));

  // 세션 직렬화
  passport.registerUserSerializer(async (user: any) => {
    return user.id;
  });

  // 세션 역직렬화
  passport.registerUserDeserializer(async (id: number) => {
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
      return user;
    } catch (error) {
      throw error;
    }
  });
}
