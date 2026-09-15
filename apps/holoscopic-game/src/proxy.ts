import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    // No '/admin/:path*'. Platform administration moved to the platform admin
    // app and the page here was deleted — but middleware runs BEFORE routing,
    // so this entry kept guarding a route that no longer exists. The result
    // was worse than a 404: an unauthenticated visitor was sent to
    // /login?callbackUrl=/admin, signed in successfully, and was returned to
    // /admin to be shown a 404 — made to authenticate for a page that could
    // never load. A signed-in visitor skipped straight to the same 404.
    '/create/:path*',
    '/profile/:path*',
    // Not '/invite/:path*': an invitation link has to render for someone who
    // has no account yet, so that page handles signed-out itself.
    '/invitations/:path*',
  ],
};