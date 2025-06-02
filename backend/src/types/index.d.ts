declare module 'fastify' {
  export interface PassportUser {
    id: number;
    googleId: string;
    email: string;
    displayName: string;
    profileImage: string;
  }
}
