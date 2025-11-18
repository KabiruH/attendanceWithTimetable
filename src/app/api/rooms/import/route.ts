// app/api/rooms/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';

// Helper function to verify authentication
async function verifyAuth() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('token');

        if (!token) {
            return { error: 'No token found', status: 401 };
        }

        const { payload } = await jwtVerify(
            token.value,
            new TextEncoder().encode(process.env.JWT_SECRET)
        );

        const userId = Number(payload.id);

        // ✅ Add validation for userId
        if (!userId || isNaN(userId)) {
            console.error('Invalid user ID in token:', payload.id);
            return { error: 'Invalid user ID in token', status: 401 };
        }

        const role = payload.role as string;
        const name = payload.name as string;

        // Now this query should work
        const user = await db.users.findUnique({
            where: { id: userId },
            select: { id: true, name: true, role: true, department: true, is_active: true }
        });

        if (!user || !user.is_active) {
            return { error: 'User not found or inactive', status: 401 };
        }

        return { user: { ...user, id: userId, role, name } };
    } catch (error) {
        console.error('Auth verification error:', error);
        return { error: 'Invalid token', status: 401 };
    }
}

// POST /api/rooms/import - Bulk import rooms from Excel (Admin only)
export async function POST(request: NextRequest) {
    try {
        const authResult = await verifyAuth();
        if (authResult.error) {
            return NextResponse.json({ error: authResult.error }, { status: authResult.status });
        }

        // ✅ Explicit check for user existence
        if (!authResult.user) {
            return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
        }

        const { user } = authResult;

        // Check if user is admin
        if (user.role !== 'admin') {
            return NextResponse.json(
                { error: 'Unauthorized. Admin access required.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { rooms } = body;

        if (!rooms || !Array.isArray(rooms)) {
            return NextResponse.json(
                { error: 'Invalid data format. Expected array of rooms.' },
                { status: 400 }
            );
        }

        const results = {
            imported: 0,
            skipped: 0,
            errors: [] as string[]
        };

        // Get existing room names to avoid duplicates
        const existingRooms = await db.rooms.findMany({
            select: { name: true }
        });
        const existingNames = new Set(existingRooms.map(r => r.name.toLowerCase()));

        // Process each room
        for (let i = 0; i < rooms.length; i++) {
            const roomData = rooms[i];

            try {
                // Validation
                if (!roomData.name) {
                    results.errors.push(`Row ${i + 1}: Missing required field (name)`);
                    results.skipped++;
                    continue;
                }

                const roomName = roomData.name.toString().trim();
                const lowerName = roomName.toLowerCase();

                // Check for duplicate names in this import batch or existing data
                if (existingNames.has(lowerName)) {
                    results.errors.push(`Row ${i + 1}: Room name '${roomName}' already exists`);
                    results.skipped++;
                    continue;
                }

                // Add to existing names set to prevent duplicates within this batch
                existingNames.add(lowerName);

                // Parse capacity (handle various formats)
                let capacity = null;
                if (roomData.capacity) {
                    const parsedCapacity = parseInt(roomData.capacity.toString());
                    if (!isNaN(parsedCapacity) && parsedCapacity > 0) {
                        capacity = parsedCapacity;
                    }
                }

                // Parse equipment (handle comma-separated string or array)
                let equipment = null;
                if (roomData.equipment) {
                    if (Array.isArray(roomData.equipment)) {
                        equipment = roomData.equipment.filter((e: string) => e && e.trim());
                    } else if (typeof roomData.equipment === 'string') {
                        // Split by comma and clean up
                        equipment = roomData.equipment
                            .split(',')
                            .map((e: string) => e.trim())
                            .filter((e: string) => e.length > 0);
                    }

                    // Only set equipment if we have items
                    if (equipment && equipment.length === 0) {
                        equipment = null;
                    }
                }

                // Validate room_type if provided
                const validRoomTypes = [
                    'classroom', 'lab', 'computer_lab', 'workshop',
                    'lecture_hall', 'studio', 'auditorium'
                ];
                let roomType = null;
                if (roomData.room_type) {
                    const typeValue = roomData.room_type.toString().toLowerCase().replace(/\s+/g, '_');
                    if (validRoomTypes.includes(typeValue)) {
                        roomType = typeValue;
                    } else {
                        results.errors.push(`Row ${i + 1}: Invalid room type '${roomData.room_type}'. Valid types: ${validRoomTypes.join(', ')}`);
                        results.skipped++;
                        continue;
                    }
                }

                // Create room
                const now = new Date();

                await db.rooms.create({
                    data: {
                        name: roomName,
                        capacity: capacity,
                        room_type: roomType,
                        equipment: equipment,
                        department: roomData.department ? roomData.department.toString().trim() : null,
                        is_active: roomData.is_active !== false,
                        updated_at: now
                    }
                });


                results.imported++;
            } catch (error) {
                console.error(`Error importing room at row ${i + 1}:`, error);
                results.errors.push(`Row ${i + 1}: Failed to create room - ${error instanceof Error ? error.message : 'Unknown error'}`);
                results.skipped++;
            }
        }

        // Return results
        if (results.imported === 0 && results.errors.length > 0) {
            return NextResponse.json(
                {
                    error: 'No rooms were imported',
                    details: results
                },
                { status: 400 }
            );
        }

        return NextResponse.json({
            message: `Successfully imported ${results.imported} rooms`,
            imported: results.imported,
            skipped: results.skipped,
            errors: results.errors
        });

    } catch (error) {
        console.error('Error importing rooms:', error);
        return NextResponse.json(
            { error: 'Failed to import rooms' },
            { status: 500 }
        );
    }
}