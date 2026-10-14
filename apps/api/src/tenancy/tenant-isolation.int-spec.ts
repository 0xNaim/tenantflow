import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantTransactionService } from './tenant-transaction.service.js';

describe('Tenant isolation (PostgreSQL RLS)', () => {
  const prisma = new PrismaService();
  const tenancy = new TenantTransactionService(prisma);

  const userA = {
    id: randomUUID(),
    email: `user-a-${randomUUID()}@example.test`,
  };

  const userB = {
    id: randomUUID(),
    email: `user-b-${randomUUID()}@example.test`,
  };

  const tenantA = {
    id: randomUUID(),
    slug: `tenant-a-${randomUUID()}`,
  };

  const tenantB = {
    id: randomUUID(),
    slug: `tenant-b-${randomUUID()}`,
  };

  const projectA = {
    id: randomUUID(),
    name: 'Tenant A project',
  };

  const projectB = {
    id: randomUUID(),
    name: 'Tenant B project',
  };

  async function seedTenant(
    tenant: typeof tenantA,
    userId: string,
    project: typeof projectA,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.tenant_id', ${tenant.id}, true)
      `;

      await tx.tenant.create({
        data: {
          id: tenant.id,
          name: tenant.slug,
          slug: tenant.slug,
        },
      });

      await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId,
        },
      });

      await tx.project.create({
        data: {
          id: project.id,
          tenantId: tenant.id,
          name: project.name,
        },
      });
    });
  }

  beforeAll(async () => {
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        {
          id: userA.id,
          email: userA.email,
          passwordHash: 'test-only-hash',
        },
        {
          id: userB.id,
          email: userB.email,
          passwordHash: 'test-only-hash',
        },
      ],
    });

    await seedTenant(tenantA, userA.id, projectA);
    await seedTenant(tenantB, userB.id, projectB);
  });

  afterAll(async () => {
    for (const tenant of [tenantA, tenantB]) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT set_config('app.tenant_id', ${tenant.id}, true)
        `;

        await tx.projectMember.deleteMany({
          where: { tenantId: tenant.id },
        });

        await tx.project.deleteMany({
          where: { tenantId: tenant.id },
        });

        await tx.membership.deleteMany({
          where: { tenantId: tenant.id },
        });

        await tx.tenant.deleteMany({
          where: { id: tenant.id },
        });
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: { in: [userA.id, userB.id] },
      },
    });

    await prisma.$disconnect();
  });

  it('hides other tenants projects without a tenant filter', async () => {
    const projects = await tenancy.withTenantContext(userA.id, tenantA.id, (tx) =>
      tx.project.findMany(),
    );

    expect(projects.map((project) => project.id)).toEqual([projectA.id]);

    expect(projects.some((project) => project.id === projectB.id)).toBe(false);
  });

  it('blocks cross-tenant updates', async () => {
    const result = await tenancy.withTenantContext(userA.id, tenantA.id, (tx) =>
      tx.project.updateMany({
        where: { id: projectB.id },
        data: { name: 'Unauthorized modification' },
      }),
    );

    expect(result.count).toBe(0);
  });

  it('blocks cross-tenant deletes', async () => {
    const result = await tenancy.withTenantContext(userA.id, tenantA.id, (tx) =>
      tx.project.deleteMany({
        where: { id: projectB.id },
      }),
    );

    expect(result.count).toBe(0);
  });

  it('denies access when the membership is inactive', async () => {
    await tenancy.withTenantContext(userA.id, tenantA.id, (tx) =>
      tx.membership.update({
        where: {
          tenantId_userId: {
            tenantId: tenantA.id,
            userId: userA.id,
          },
        },
        data: { status: 'SUSPENDED' },
      }),
    );

    await expect(
      tenancy.withTenantContext(userA.id, tenantA.id, (tx) => tx.project.findMany()),
    ).rejects.toThrow('Active tenant membership required');

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT set_config('app.tenant_id', ${tenantA.id}, true)
      `;

      await tx.membership.update({
        where: {
          tenantId_userId: {
            tenantId: tenantA.id,
            userId: userA.id,
          },
        },
        data: { status: 'ACTIVE' },
      });
    });
  });

  it('does not leak tenant context after a transaction', async () => {
    await tenancy.withTenantContext(userA.id, tenantA.id, (tx) => tx.project.findMany());

    const projects = await prisma.project.findMany();

    expect(projects).toEqual([]);
  });
});
