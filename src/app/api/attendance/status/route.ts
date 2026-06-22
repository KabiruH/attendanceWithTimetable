// app/api/attendance/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import { ensureCheckouts } from '@/lib/utils/cronUtils';

interface JwtPayload {
  id: number;
  employee_id: number;
  userId: number;
  role: string;
  name: string;
  email: string;
}

// Supports both cookie (web) and Bearer token (mobile)
async function getTokenPayload(request: NextRequest): Promise<JwtPayload | null> {
  if (!process.env.JWT_SECRET) return null;

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);

  // 1. Try Bearer token from Authorization header (mobile)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const { payload } = await jwtVerify(token, secret);
      return payload as unknown as JwtPayload;
    } catch (error) {
      console.error('Bearer token verification failed:', error);
    }
  }

  // 2. Fall back to cookie (web)
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get('token');
    if (tokenCookie) {
      const { payload } = await jwtVerify(tokenCookie.value, secret);
      return payload as unknown as JwtPayload;
    }
  } catch (error) {
    console.error('Cookie token verification failed:', error);
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    // Run checkouts in background - don't block the response
    ensureCheckouts().catch(err => console.error('Checkout processing error:', err));

    const payload = await getTokenPayload(request);

    if (!payload) {
      return NextResponse.json(
        { error: 'No token found' },
        { status: 401 }
      );
    }

    // userId is users.id - works for both web (payload.id) and mobile (payload.userId)
    const userId = Number(payload.id || payload.userId);
    const role = payload.role as string;
    const today = new Date().toISOString().split('T')[0];

    if (role === 'admin') {
      const [personalAttendance, todayRecord, allAttendance] = await Promise.all([
        db.attendance.findMany({
          where: {
            employee_id: userId,
            date: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          },
          include: {
            users: {
              select: {
                name: true,
                id_number: true,
                department: true
              }
            }
          },
          orderBy: { date: 'desc' }
        }),
        db.attendance.findFirst({
          where: {
            employee_id: userId,
            date: {
              gte: new Date(today),
              lt: new Date(new Date(today).setDate(new Date(today).getDate() + 1))
            }
          }
        }),
        db.attendance.findMany({
          where: {
            date: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7))
            }
          },
          include: {
            users: {
              select: {
                name: true,
                id_number: true,
                department: true,
                role: true
              }
            }
          },
          orderBy: [
            { date: 'desc' },
            { employee_id: 'asc' }
          ]
        })
      ]);

      const isCheckedIn = !!(todayRecord?.check_in_time && !todayRecord?.check_out_time);

      const processedPersonalAttendance = personalAttendance.map(record => ({
        ...record,
        employee_name: record.users.name,
        date: record.date.toISOString(),
        check_in_time: record.check_in_time?.toISOString() || null,
        check_out_time: record.check_out_time?.toISOString() || null
      }));

      const totalDays = personalAttendance.length;
      const presentDays = personalAttendance.filter(r => r.status?.toLowerCase() === 'present').length;
      const lateDays = personalAttendance.filter(r => r.status?.toLowerCase() === 'late').length;
      const absentDays = personalAttendance.filter(r => r.status?.toLowerCase() === 'absent').length;
      const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

      return NextResponse.json({
        role: 'admin',
        isCheckedIn,
        personalAttendance: processedPersonalAttendance,
        stats: { totalDays, presentDays, lateDays, absentDays, attendanceRate },
        attendanceData: allAttendance.map(record => ({
          ...record,
          employee_name: record.users.name,
          employee_id_number: record.users.id_number,
          employee_department: record.users.department,
          date: record.date.toISOString(),
          check_in_time: record.check_in_time?.toISOString() || null,
          check_out_time: record.check_out_time?.toISOString() || null
        }))
      });
    }

    // Employee
    const [todayRecord, monthlyRecords] = await Promise.all([
      db.attendance.findFirst({
        where: {
          employee_id: userId,
          date: {
            gte: new Date(today),
            lt: new Date(new Date(today).setDate(new Date(today).getDate() + 1))
          }
        },
        include: {
          users: { select: { name: true } }
        }
      }),
      db.attendance.findMany({
        where: {
          employee_id: userId,
          date: {
            gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
          }
        },
        include: {
          users: { select: { name: true } }
        },
        orderBy: { date: 'desc' }
      })
    ]);

    const isCheckedIn = !!(todayRecord?.check_in_time && !todayRecord?.check_out_time);

    const totalDays = monthlyRecords.length;
    const presentDays = monthlyRecords.filter(r => r.status?.toLowerCase() === 'present').length;
    const lateDays = monthlyRecords.filter(r => r.status?.toLowerCase() === 'late').length;
    const absentDays = monthlyRecords.filter(r => r.status?.toLowerCase() === 'absent').length;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    const processedMonthlyRecords = monthlyRecords.map(record => ({
      ...record,
      employee_name: record.users.name,
      date: record.date.toISOString(),
      check_in_time: record.check_in_time?.toISOString() || null,
      check_out_time: record.check_out_time?.toISOString() || null
    }));

    return NextResponse.json({
      role: 'employee',
      isCheckedIn,
      stats: { totalDays, presentDays, lateDays, absentDays, attendanceRate },
      todayRecord: todayRecord ? {
        ...todayRecord,
        employee_name: todayRecord.users.name,
        date: todayRecord.date.toISOString(),
        check_in_time: todayRecord.check_in_time?.toISOString() || null,
        check_out_time: todayRecord.check_out_time?.toISOString() || null
      } : null,
      attendanceData: processedMonthlyRecords
    });

  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch attendance status' },
      { status: 500 }
    );
  }
}