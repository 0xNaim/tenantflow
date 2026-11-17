import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateAuditLogInput {
  actorUserId?: string;
  tenantId?: string;

  action: string;
  status: 'SUCCESS' | 'FAILURE';

  resourceType?: string;
  resourceId?: string;

  requestId?: string;
  ipAddress?: string;
  userAgent?: string;

  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    await this.prismaService.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,

        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,

        status: input.status,

        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,

        metadata: input.metadata,
      },
    });
  }
}
