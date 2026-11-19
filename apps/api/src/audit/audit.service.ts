import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export const AuditAction = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  MFA_CHALLENGE_CREATED: 'MFA_CHALLENGE_CREATED',
  MFA_VERIFICATION_SUCCESS: 'MFA_VERIFICATION_SUCCESS',
  MFA_VERIFICATION_FAILURE: 'MFA_VERIFICATION_FAILURE',
  LOGOUT: 'LOGOUT',
  LOGOUT_ALL: 'LOGOUT_ALL',
  SESSION_REVOKED: 'SESSION_REVOKED',
  PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export interface CreateAuditLogInput {
  actorUserId?: string;
  tenantId?: string;

  action: AuditActionType;
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
    await this.prismaService.auditLog.createMany({
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
