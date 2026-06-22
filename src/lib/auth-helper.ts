// lib/auth-helper.ts
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

interface AuthResult {
  user: {
    id: number;
    name: string;
    role: string;
    department: string | null;
    is_active: boolean;
    id_number: string;
    email: string | null;
    has_timetable_admin?: boolean;
  } | null;
  error?: string;
  status?: number;
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    let token: string | null = null;

    // Method 1: Check Authorization header (for mobile apps)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // Method 2: Check cookies (for web apps)
    if (!token) {
      const cookieHeader = request.headers.get('cookie');
      const cookieToken = cookieHeader?.split(';')
        .find(cookie => cookie.trim().startsWith('token='))
        ?.split('=')[1];
      
      if (cookieToken) {
        token = cookieToken;
      }
    }

    if (!token) {
      return {
        user: null,
        error: 'No token found',
        status: 401
      };
    }

    // Verify token
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    const userId = Number(payload.id);
    const role = payload.role as string;
    const name = payload.name as string;

    // Get user from database
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        name: true, 
        role: true, 
        department: true, 
        is_active: true,
        id_number: true,
        email: true,
        has_timetable_admin: true
      }
    });

    if (!user) {
      return {
        user: null,
        error: 'User not found',
        status: 401
      };
    }

    if (!user.is_active) {
      return {
        user: null,
        error: 'User is inactive',
        status: 401
      };
    }
        
    return { 
      user: { 
        ...user, 
        id: userId, 
        role,
        name
      } 
    };
  } catch (error: any) {
    console.error('❌ Authentication error:', error.message);
    return {
      user: null,
      error: 'Invalid token',
      status: 401
    };
  }
}