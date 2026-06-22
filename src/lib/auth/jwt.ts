// lib/auth/jwt.ts
import { jwtVerify } from 'jose';

export async function verifyJwtToken(token: string) {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    
    return {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as string,
      name: payload.name as string,
      has_timetable_admin: payload.has_timetable_admin as boolean | undefined,
    };
  } catch (error) {
    return null;
  }
}