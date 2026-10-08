//src\lib\auth\verify-auth.ts
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

export async function verifyAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token');
  if (!token) return { error: 'No token found', status: 401 };

  // 1. Token problems → 401 (genuinely logged out)
  let payload;
  try {
    ({ payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    ));
  } catch (err: any) {
    const expired = err?.code === 'ERR_JWT_EXPIRED';
    return { error: expired ? 'Session expired' : 'Invalid token', status: 401 };
  }

  // 2. Database problems → 503 (temporary; do NOT log the user out)
  try {
    const userId = Number(payload.id);
    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, department: true, is_active: true, has_timetable_admin: true, email: true },
    });
    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId } };
  } catch (err) {
    console.error('verifyAuth: user lookup failed', err);
    return { error: 'Service temporarily unavailable, please retry', status: 503 };
  }
}