const { PrismaClient } = require('@prisma/client');
const { pbkdf2Sync, randomBytes, timingSafeEqual } = require('node:crypto');

const prisma = new PrismaClient();

const PASSWORD_HASH_ALGORITHM = 'pbkdf2_sha512';
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_KEY_LENGTH = 64;
const PASSWORD_HASH_DIGEST = 'sha512';

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'admin12345';
const DEFAULT_ADMIN_FULL_NAME = 'Local Admin';

// QA admin fixture: opt-in via SEED_ON_STARTUP=true. Override password with QA_ADMIN_PASSWORD env.
const DEFAULT_QA_ADMIN_EMAIL = 'qa-admin@example.com';
const DEFAULT_QA_ADMIN_PASSWORD = 'qa-admin12345';
const DEFAULT_QA_ADMIN_FULL_NAME = 'QA Admin';

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function requireNonEmpty(value, fallback) {
  const resolved = value ?? fallback;
  return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved.trim() : fallback;
}

function hashPassword(password) {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_HASH_ITERATIONS,
    PASSWORD_HASH_KEY_LENGTH,
    PASSWORD_HASH_DIGEST,
  );

  return {
    passwordHash: hash.toString('base64'),
    passwordHashAlgorithm: PASSWORD_HASH_ALGORITHM,
    passwordHashParams: {
      salt: salt.toString('base64'),
      iterations: PASSWORD_HASH_ITERATIONS,
      keyLength: PASSWORD_HASH_KEY_LENGTH,
      digest: PASSWORD_HASH_DIGEST,
      encoding: 'base64',
    },
  };
}

function verifyPassword(password, credential) {
  if (credential.passwordHashAlgorithm !== PASSWORD_HASH_ALGORITHM) {
    return false;
  }

  const params = credential.passwordHashParams;
  if (!params || typeof params.salt !== 'string') {
    return false;
  }

  const expectedHash = Buffer.from(credential.passwordHash, 'base64');
  const actualHash = pbkdf2Sync(
    password,
    Buffer.from(params.salt, 'base64'),
    Number(params.iterations),
    Number(params.keyLength),
    params.digest,
  );

  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

async function upsertAdmin() {
  const email = requireNonEmpty(process.env.SEED_ADMIN_EMAIL, DEFAULT_ADMIN_EMAIL);
  const password = requireNonEmpty(process.env.SEED_ADMIN_PASSWORD, DEFAULT_ADMIN_PASSWORD);
  const fullName = requireNonEmpty(process.env.SEED_ADMIN_FULL_NAME, DEFAULT_ADMIN_FULL_NAME);
  const resetPassword = process.env.SEED_ADMIN_RESET_PASSWORD === 'true';
  const emailNormalized = normalizeEmail(email);

  const existingUser = await prisma.user.findFirst({
    where: {
      emailNormalized,
      deletedAt: null,
    },
    include: {
      credential: true,
    },
  });

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          fullName,
          role: 'admin',
          status: 'active',
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          emailNormalized,
          fullName,
          role: 'admin',
          status: 'active',
          emailVerifiedAt: new Date(),
        },
      });

  if (!existingUser?.credential) {
    await prisma.userCredential.create({
      data: {
        userId: user.id,
        ...hashPassword(password),
        passwordChangedAt: new Date(),
      },
    });
  } else if (resetPassword) {
    await prisma.userCredential.update({
      where: { userId: user.id },
      data: {
        ...hashPassword(password),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
      },
    });
  }

  const credential = await prisma.userCredential.findUniqueOrThrow({ where: { userId: user.id } });
  const passwordMatches = verifyPassword(password, credential);

  return {
    userId: user.id,
    email: user.email,
    passwordUpdated: !existingUser?.credential || resetPassword,
    passwordMatchesConfiguredSecret: passwordMatches,
  };
}

// Guard via SEED_ON_STARTUP; both staging and prod set NODE_ENV=production, so NODE_ENV branching wouldn't distinguish them.
async function upsertQaAdmin() {
  if (process.env.SEED_ON_STARTUP !== 'true') {
    return { skipped: true, reason: 'SEED_ON_STARTUP not enabled' };
  }

  const email = DEFAULT_QA_ADMIN_EMAIL;
  const password = requireNonEmpty(process.env.QA_ADMIN_PASSWORD, DEFAULT_QA_ADMIN_PASSWORD);
  const fullName = DEFAULT_QA_ADMIN_FULL_NAME;
  const emailNormalized = normalizeEmail(email);

  const existingUser = await prisma.user.findFirst({
    where: {
      emailNormalized,
      deletedAt: null,
    },
    include: {
      credential: true,
    },
  });

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email,
          fullName,
          role: 'admin',
          status: 'active',
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
        },
      })
    : await prisma.user.create({
        data: {
          email,
          emailNormalized,
          fullName,
          role: 'admin',
          status: 'active',
          emailVerifiedAt: new Date(),
        },
      });

  if (!existingUser?.credential) {
    await prisma.userCredential.create({
      data: {
        userId: user.id,
        ...hashPassword(password),
        passwordChangedAt: new Date(),
      },
    });
  }

  const credential = await prisma.userCredential.findUniqueOrThrow({ where: { userId: user.id } });
  const passwordMatches = verifyPassword(password, credential);

  return {
    userId: user.id,
    email: user.email,
    passwordUpdated: !existingUser?.credential,
    passwordMatchesConfiguredSecret: passwordMatches,
  };
}

async function upsertSampleStoreAndCatalog() {
  const store = await prisma.store.upsert({
    where: { code: 'STORE-001' },
    update: {
      name: 'Sample Store 001',
      address: 'Local development sample store',
      timezone: 'Europe/Moscow',
      status: 'active',
    },
    create: {
      code: 'STORE-001',
      name: 'Sample Store 001',
      address: 'Local development sample store',
      timezone: 'Europe/Moscow',
      status: 'active',
    },
  });

  const existingCatalog = await prisma.storeCatalog.findFirst({
    where: {
      storeId: store.id,
      name: 'Main Catalog',
    },
  });

  const catalog = existingCatalog
    ? await prisma.storeCatalog.update({
        where: { id: existingCatalog.id },
        data: {
          status: 'active',
          name: 'Main Catalog',
        },
      })
    : await prisma.storeCatalog.create({
        data: {
          storeId: store.id,
          name: 'Main Catalog',
          status: 'active',
        },
      });

  return { storeId: store.id, catalogId: catalog.id };
}

async function upsertSampleProducts() {
  const sampleProducts = [
    {
      defaultPluCode: '1001',
      name: 'Apples Red Weighted',
      shortName: 'Red Apples',
      description: 'Local development sample weighted apples',
      barcode: '4600000000011',
      sku: 'APL-RED-001',
      unit: 'kg',
    },
    {
      defaultPluCode: '1002',
      name: 'Bananas Weighted',
      shortName: 'Bananas',
      description: 'Local development sample bananas',
      barcode: '4600000000028',
      sku: 'BAN-001',
      unit: 'kg',
    },
    {
      defaultPluCode: '2001',
      name: 'Milk Bottle 1L',
      shortName: 'Milk 1L',
      description: 'Local development sample piece product',
      barcode: '4600000000035',
      sku: 'MILK-1L-001',
      unit: 'piece',
    },
  ];

  const products = [];
  for (const product of sampleProducts) {
    products.push(
      await prisma.product.upsert({
        where: { defaultPluCode: product.defaultPluCode },
        update: {
          name: product.name,
          shortName: product.shortName,
          description: product.description,
          barcode: product.barcode,
          sku: product.sku,
          unit: product.unit,
          status: 'active',
        },
        create: {
          ...product,
          status: 'active',
        },
      }),
    );
  }

  return products.map((product) => product.id);
}

async function main() {
  const admin = await upsertAdmin();
  const qaAdmin = await upsertQaAdmin();
  const sampleStore = await upsertSampleStoreAndCatalog();
  const productIds = await upsertSampleProducts();

  console.log('Seed completed');
  console.log(
    JSON.stringify(
      {
        admin,
        qaAdmin,
        sampleStore,
        sampleProductCount: productIds.length,
        sampleProductIds: productIds,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Seed failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
