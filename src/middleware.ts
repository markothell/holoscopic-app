export { default } from 'next-auth/middleware';

// Protect these routes - require authentication
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/profile/:path*'
  ]
};