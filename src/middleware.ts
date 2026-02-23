export { default } from 'next-auth/middleware';

// Protect these routes - require authentication
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/create/:path*',
    '/profile/:path*'
  ]
};