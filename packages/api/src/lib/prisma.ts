/**
 * Prisma Client - Global singleton for database access
 *
 * This module provides a global Prisma client instance that is reused
 * across the application to avoid connection pool exhaustion.
 */

import { PrismaClient } from '@prisma/client';

// Add Prisma to the global type
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

// Global prisma instance to avoid multiple connections in dev
const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
