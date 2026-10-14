import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TenantTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async withTenantContext<T>(
    userId: string,
    tenantId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT set_config(
            'app.tenant_id',
            ${tenantId},
            true
          )
        `;

        const membership = await tx.membership.findFirst({
          where: {
            userId,
            tenantId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        if (!membership) {
          throw new ForbiddenException('Active tenant membership required');
        }

        return work(tx);
      },
      {
        maxWait: 5000,
        timeout: 10000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      },
    );
  }
}
