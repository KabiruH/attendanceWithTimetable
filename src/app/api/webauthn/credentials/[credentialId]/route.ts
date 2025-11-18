// /app/api/webauthn/credentials/[credentialId]/route.ts
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkAuth } from '@/lib/checkAuth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  try {
    // Use the same auth check as profile route
    const authResult = await checkAuth();
    
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: authResult.status || 401 });
    }

    const {credentialId} = await params;
    
    // Find the credential
    const credential = await prisma.webauthncredentials.findUnique({
      where: { credentialId },
      select: { userId: true },
    });

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      );
    }

    // Check if the credential belongs to the logged-in user
    if (credential.userId !== authResult.user.userId) {
      return NextResponse.json(
        { error: 'Unauthorized to delete this credential' },
        { status: 403 }
      );
    }

    // Delete the credential
    await prisma.webauthncredentials.delete({
      where: { credentialId },
    });

    return NextResponse.json({ 
      success: true,
      message: 'Credential deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting credential:', error);
    return NextResponse.json(
      { error: 'Failed to delete credential' },
      { status: 500 }
    );
  }
}