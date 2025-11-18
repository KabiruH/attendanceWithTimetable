// app/api/webauthn/generate-authentication-options/route.ts - DEBUG VERSION
import { NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/types';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    
    const requestBody = await req.json();
    
    const { username } = requestBody;
   
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
   
   
    // Determine RP ID based on environment
    const host = req.headers.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
   
    const rpID = isLocalhost ? 'localhost' : (process.env.WEBAUTHN_RP_ID || 'localhost');
   
    // Find the user by ID number
    const user = await prisma.users.findUnique({
      where: { id_number: username },
      include: {
        webauthncredentials: {
          select: {
            id: true,
            credentialId: true,
            transports: true,
            created_at: true,
            counter: true
          }
        }
      }
    });
   
    if (!user) {
      
      // Debug: Check if user exists with different casing or spacing
      const allUsers = await prisma.users.findMany({
        select: { id: true, id_number: true, name: true }
      });
      
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
 
   
    // Debug: Double-check with direct query
    const directCredentialsQuery = await prisma.webauthncredentials.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        credentialId: true,
        transports: true,
        created_at: true,
        counter: true
      }
    });
    
    directCredentialsQuery.forEach((cred, index) => {
  
    });
   
    // Debug: Check ALL credentials in database
    const allCredentials = await prisma.webauthncredentials.findMany({
      select: {
        id: true,
        userId: true,
        credentialId: true,
        created_at: true
      }
    });
    allCredentials.forEach((cred, index) => {
    });
   
    // Use the direct query results as they're more reliable
    const credentialsToUse = directCredentialsQuery;
   
    // Check if user has registered credentials
    if (!credentialsToUse || credentialsToUse.length === 0) {
      
      return NextResponse.json({
        error: 'No registered credentials found for user',
        debug: {
          userId: user.id,
          id_number: user.id_number,
          totalCredentialsInDB: allCredentials.length,
          credentialsForThisUser: credentialsToUse.length,
          userExists: true
        }
      }, { status: 400 });
    }
   
   
    // Map credentials to the format expected by generateAuthenticationOptions
    const allowCredentials = credentialsToUse.map((cred, index) => {
      const credential: {
        id: string;
        type: 'public-key';
        transports?: AuthenticatorTransportFuture[];
      } = {
        id: cred.credentialId,
        type: 'public-key',
      };
     
      // Add transports if available
      if (cred.transports) {
        try {
          credential.transports = JSON.parse(cred.transports) as AuthenticatorTransportFuture[];
        } catch (e) {
          console.warn(`Could not parse transports for credential ${cred.id}:`, e);
        }
      }
     
      return credential;
    });
   
    // Generate authentication options
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    });
  
    try {
      // Store or update the challenge
      await prisma.webauthncredentialchallenge.upsert({
        where: { userId: user.id },
        update: {
          challenge: options.challenge,
          expires: new Date(Date.now() + 5 * 60 * 1000),
        },
        create: {
          userId: user.id,
          challenge: options.challenge,
          expires: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
    } catch (error) {
      console.error('❌ Error storing challenge:', error);
      return NextResponse.json(
        { error: 'Failed to store challenge' },
        { status: 500 }
      );
    }
   
    return NextResponse.json(options);
  } catch (error) {
    console.error('❌ Error generating authentication options:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication options' },
      { status: 500 }
    );
  }
}