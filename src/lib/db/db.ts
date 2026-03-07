// lib/db.ts
import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

// AFTER
const createPrismaClient = () => {
  const url = process.env.DATABASE_URL!;
  const pooledUrl = url.includes('?') 
    ? `${url}&connection_limit=3&pool_timeout=10`
    : `${url}?connection_limit=3&pool_timeout=10`;

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : ['error'],
    datasources: {
      db: {
        url: pooledUrl,
      },
    },
  })
}

export const db = globalThis.prisma ?? createPrismaClient()

// Prevent multiple instances during development hot reload
if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = db
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await db.$disconnect()
})