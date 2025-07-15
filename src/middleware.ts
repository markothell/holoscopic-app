import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get('host') || '';
  
  // Extract subdomain from hostname
  const subdomain = hostname.split('.')[0];
  
  // Get admin subdomain from environment variable
  const adminSubdomain = process.env.ADMIN_SUBDOMAIN || 'admin';
  
  // Check if this is an admin route
  const isAdminRoute = url.pathname.startsWith('/admin');
  
  // For local development, check for admin.localhost
  const isLocalAdmin = hostname === 'admin.localhost:3000' || hostname === 'admin.localhost';
  
  // For production, check if subdomain matches admin subdomain
  const isAdminSubdomain = subdomain === adminSubdomain || isLocalAdmin;
  
  // If on admin subdomain but not accessing admin routes, redirect to admin
  if (isAdminSubdomain && !isAdminRoute) {
    url.pathname = '/admin' + url.pathname;
    return NextResponse.redirect(url);
  }
  
  if (isAdminRoute) {
    // If accessing admin route but not on admin subdomain, return 404
    if (!isAdminSubdomain) {
      return new NextResponse(null, { status: 404 });
    }
  }
  
  // Allow the request to continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};