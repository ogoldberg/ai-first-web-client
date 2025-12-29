/**
 * Database Seed Script
 *
 * Creates an initial admin tenant and API key for bootstrapping the system.
 * Run with: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();

/**
 * Generate a new API key
 */
function generateApiKey(env: 'live' | 'test' = 'live'): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = randomBytes(32).toString('hex').substring(0, 32);
  const key = `ub_${env}_${randomPart}`;
  const keyHash = createHash('sha256').update(key).digest('hex');
  const keyPrefix = key.substring(0, 8);
  return { key, keyHash, keyPrefix };
}

async function main() {
  console.log('Seeding database...\n');

  // Check if admin tenant already exists
  const existingAdmin = await prisma.tenant.findFirst({
    where: { email: 'admin@unbrowser.ai' },
  });

  if (existingAdmin) {
    console.log('Admin tenant already exists:', existingAdmin.id);
    console.log('To create a new API key, delete the existing tenant first.\n');
    return;
  }

  // Create admin tenant
  const adminTenant = await prisma.tenant.create({
    data: {
      name: 'Admin',
      email: 'admin@unbrowser.ai',
      plan: 'ENTERPRISE',
      dailyLimit: 1000000,
      monthlyLimit: null,
      sharePatterns: true,
    },
  });

  console.log('Created admin tenant:', adminTenant.id);

  // Create admin API key with all permissions
  const { key, keyHash, keyPrefix } = generateApiKey('live');

  await prisma.apiKey.create({
    data: {
      tenantId: adminTenant.id,
      keyHash,
      keyPrefix,
      name: 'Admin API Key',
      permissions: ['browse', 'batch', 'admin'],
    },
  });

  console.log('\n========================================');
  console.log('ADMIN API KEY (save this, shown only once):');
  console.log('========================================');
  console.log(key);
  console.log('========================================\n');

  // Optionally create a test tenant for move-abroad-ai
  const moveAbroadEmail = process.env.MOVE_ABROAD_EMAIL || 'move-abroad@example.com';

  const existingMoveAbroad = await prisma.tenant.findFirst({
    where: { email: moveAbroadEmail },
  });

  if (!existingMoveAbroad && process.env.CREATE_MOVE_ABROAD === 'true') {
    const moveAbroadTenant = await prisma.tenant.create({
      data: {
        name: 'Move Abroad AI',
        email: moveAbroadEmail,
        plan: 'STARTER',
        dailyLimit: 1000,
        sharePatterns: true,
      },
    });

    const moveAbroadKey = generateApiKey('live');

    await prisma.apiKey.create({
      data: {
        tenantId: moveAbroadTenant.id,
        keyHash: moveAbroadKey.keyHash,
        keyPrefix: moveAbroadKey.keyPrefix,
        name: 'Move Abroad API Key',
        permissions: ['browse', 'batch'],
      },
    });

    console.log('Created Move Abroad tenant:', moveAbroadTenant.id);
    console.log('\n========================================');
    console.log('MOVE ABROAD API KEY (save this, shown only once):');
    console.log('========================================');
    console.log(moveAbroadKey.key);
    console.log('========================================\n');
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
