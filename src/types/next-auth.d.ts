import { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      email?: string
      role?: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    username: string
    role?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string
    username: string
    role?: string
  }
}