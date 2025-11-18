// /app/api/webauthn/verify-registration/route.ts - DEBUG VERSION
import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import prisma from '@/lib/prisma';
import { checkAuth } from '@/lib/checkAuth';

export async function POST(req: Request) {
  try {
    
    // Use the same auth check as profile route
    const authResult = await checkAuth();

    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: authResult.status || 401 });
    }

    const requestBody = await req.json();

    const { registrationResponse, id_number } = requestBody;

    if (!id_number) {
      return NextResponse.json({ error: 'id_number is required' }, { status: 400 });
    }
    const user = await prisma.users.findUnique({
      where: { id_number },
      include: {
        webauthncredentials: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    

    if (user.id !== authResult.user.userId) {
      return NextResponse.json({ error: 'Unauthorized to register for this user' }, { status: 403 });
    }

    // Get the expected challenge from the database
    const challengeRecord = await prisma.webauthncredentialchallenge.findUnique({
      where: { userId: user.id },
    });

    if (!challengeRecord || new Date() > challengeRecord.expires) {
      return NextResponse.json(
        { error: 'Challenge not found or expired' },
        { status: 400 }
      );
    }

    // Determine origin and RP ID based on environment
    const host = req.headers.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    
    // Use appropriate values based on environment
    const expectedOrigin = isLocalhost 
      ? 'http://localhost:3000' 
      : (process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000');
    
    const expectedRPID = isLocalhost 
      ? 'localhost' 
      : (process.env.WEBAUTHN_RP_ID || 'localhost');
  
    // Verify the registration response
    try {
      const verification = await verifyRegistrationResponse({
        response: registrationResponse as RegistrationResponseJSON,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin,
        expectedRPID,
        requireUserVerification: true,
      });

      if (!verification.verified) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
      }

      const { registrationInfo } = verification;

      if (!registrationInfo) {
        return NextResponse.json({ error: 'Missing registration info' }, { status: 400 });
      }
      
      const { credential } = registrationInfo;
      const credentialID = credential.id;
      const credentialPublicKey = credential.publicKey;
      const counter = credential.counter;

      // Save the credential to the database
      const credentialIdBase64 = Buffer.from(credentialID).toString('base64url');

        const newCredential = await prisma.webauthncredentials.create({
          data: {
            id: crypto.randomUUID(), // REQUIRED
            userId: user.id,
            credentialId: credentialIdBase64,
            publicKey: Buffer.from(credentialPublicKey).toString('base64url'),
            counter,
            transports: registrationResponse.response.transports
              ? JSON.stringify(registrationResponse.response.transports)
              : null,
          },
        });

      // Verify the credential was actually saved
      const savedCredential = await prisma.webauthncredentials.findUnique({
        where: { id: newCredential.id }
      });

      // Check all credentials for this user
      const allUserCredentials = await prisma.webauthncredentials.findMany({
        where: { userId: user.id },
        select: { id: true, credentialId: true, created_at: true }
      });

      // Clean up the challenge
      await prisma.webauthncredentialchallenge.delete({
        where: { userId: user.id },
      });

      return NextResponse.json({
        verified: true,
        message: 'Registration successful',
        debug: {
          userId: user.id,
          credentialId: newCredential.id,
          totalCredentials: allUserCredentials.length
        }
      });
    } catch (error) {
      console.error('Registration verification error:', error);
      return NextResponse.json({
        error: 'Verification failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Error verifying registration:', error);
    return NextResponse.json(
      { error: 'Failed to verify registration' },
      { status: 500 }
    );
  }
}