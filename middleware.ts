// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Arrays of public and protected paths
const publicPaths = ['/login', '/signup', '/'];

const protectedPaths = [
  '/dashboard', 
  '/attendance', 
  '/reports', 
  '/profile', 
  '/classes'
];

const adminOnlyPaths = [
  '/departments',
  '/users',
  '/login-logs',
];

// Paths accessible by admin OR timetable admins
const timetableAdminPaths = [
  '/timetable',
  '/rooms',
  '/term',
  '/subjects',
  '/lesson-periods',
  '/classes',
];

// Paths only accessible by full admin (not timetable admins)
const fullAdminOnlyPaths = [
  '/timetable/settings'
];

// Paths that are blocked for users with is_blocked = true
const blockedUserRestrictedPaths = [
  '/classes/select',
  '/subjects/select'
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check path types
  const isPublicPath = publicPaths.some(path => pathname === path);
  const isAdminPath = adminOnlyPaths.some(path => pathname.startsWith(path));
  const isTimetableAdminPath = timetableAdminPaths.some(path => pathname.startsWith(path));
  const isFullAdminOnlyPath = fullAdminOnlyPaths.some(path => pathname.startsWith(path));
  const isBlockedUserRestrictedPath = blockedUserRestrictedPaths.some(path => pathname.startsWith(path));
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path)) || 
                          isAdminPath || 
                          isTimetableAdminPath ||
                          isFullAdminOnlyPath;

  try {
    // Get token from cookies
    const token = request.cookies.get('token');

    // No token - redirect to login if trying to access protected routes
    if (!token && isProtectedPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Has token and trying to access public routes - redirect to dashboard
    if (token && isPublicPath && pathname !== '/') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Token exists and accessing protected routes
    if (token && isProtectedPath) {
      try {
        // Verify the token and decode its payload
        const { payload } = await jwtVerify(
          token.value,
          new TextEncoder().encode(process.env.JWT_SECRET)
        );

        // Check if user role exists
        if (!payload.role) {
          console.error('No role found in token payload');
          return NextResponse.redirect(new URL('/login', request.url));
        }

        const userRole = payload.role as string;
        const hasTimetableAdmin = payload.has_timetable_admin as boolean;
        const isBlocked = payload.is_blocked as boolean;

        // Check if user is blocked and trying to access restricted paths
        if (isBlocked && isBlockedUserRestrictedPath) {
          const dashboardUrl = new URL('/dashboard', request.url);
          dashboardUrl.searchParams.set('blocked', 'true');
          return NextResponse.redirect(dashboardUrl);
        }

        // Full admin-only path check (like timetable settings)
        if (isFullAdminOnlyPath && userRole !== 'admin') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        // Timetable admin path check - accessible by admin OR timetable admins
        if (isTimetableAdminPath) {
          const canAccessTimetable = 
            userRole === 'admin' || 
            hasTimetableAdmin;

          if (!canAccessTimetable) {
            return NextResponse.redirect(new URL('/dashboard', request.url));
          }
        }

        // Regular admin-only path check
        if (isAdminPath && userRole !== 'admin') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        }

        // Token is valid and role check passed, allow access
        return NextResponse.next();

      } catch (error) {
        console.error('Token verification failed:', error);
        // Token is invalid, clear it and redirect to login
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('token');
        return response;
      }
    }

    // Allow access to public routes
    return NextResponse.next();

  } catch (error) {
    console.error('Middleware error:', error);
    // Handle any errors by redirecting to login
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('token');
    return response;
  }
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|logo.png|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg).*)',
  ],
}