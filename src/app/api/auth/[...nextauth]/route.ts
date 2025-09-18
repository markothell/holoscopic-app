import NextAuth, { NextAuthOptions } from "next-auth"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import clientPromise from "@/lib/mongodb"

function MediaWikiProvider(options: {
  clientId: string
  clientSecret: string
  wikiUrl: string
}) {
  const { clientId, clientSecret, wikiUrl } = options

  return {
    id: "mediawiki",
    name: "MediaWiki",
    type: "oauth" as const,
    version: "1.0A",
    requestTokenUrl: `${wikiUrl}/index.php?title=Special:OAuth/initiate`,
    accessTokenUrl: `${wikiUrl}/index.php?title=Special:OAuth/token`,
    authorizationUrl: `${wikiUrl}/index.php?title=Special:OAuth/authorize`,
    profileUrl: `${wikiUrl}/index.php?title=Special:OAuth/identify`,
    clientId: clientId,
    clientSecret: clientSecret,
    profile(profile: any) {
      console.log('OAuth profile received:', profile);
      return {
        id: profile.sub || profile.username,
        name: profile.username,
        email: profile.email || `${profile.username}@wiki.holoscopic.io`,
        image: null,
      }
    },
  }
}

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    MediaWikiProvider({
      clientId: process.env.MEDIAWIKI_OAUTH_CLIENT_ID!,
      clientSecret: process.env.MEDIAWIKI_OAUTH_CLIENT_SECRET!,
      wikiUrl: process.env.MEDIAWIKI_URL || "http://157.245.188.98",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user) {
        token.userId = user.id
        token.username = user.name
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string
        session.user.username = token.username as string
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }