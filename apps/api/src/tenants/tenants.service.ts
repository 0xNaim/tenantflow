import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  PERMISSIONS,
  PermissionKey,
} from '../authorization/permissions.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

const OWNER_PERMISSIONS = Object.values(PERMISSIONS);

const ADMIN_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.PROJECT_READ,
  PERMISSIONS.PROJECT_CREATE,
  PERMISSIONS.PROJECT_UPDATE,
  PERMISSIONS.PROJECT_DELETE,
  PERMISSIONS.MEMBER_READ,
  PERMISSIONS.MEMBER_INVITE,
  PERMISSIONS.MEMBER_UPDATE_ROLE,
  PERMISSIONS.ROLE_READ,
  PERMISSIONS.ROLE_CREATE,
  PERMISSIONS.ROLE_UPDATE,
];

const MEMBER_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.PROJECT_READ,
  PERMISSIONS.MEMBER_READ,
];

@Injectable()
export class TenantsService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(userId: string, dto: CreateTenantDto) {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Tenant name is required');
    }

    const slug = dto.slug
      ? dto.slug.trim().toLowerCase()
      : this.generateSlug(name);

    if (!slug) {
      throw new BadRequestException(
        'Unable to generate slug. Please provide a valid slug.',
      );
    }

    // Verify the authenticated user is eligible to create a tenant.
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        emailVerifiedAt: true,
        disabledAt: true,
      },
    });

    if (!user || user.disabledAt) {
      throw new ForbiddenException('User is not allowed to create a tenant');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Email verification is required');
    }

    try {
      return await this.prismaService.$transaction(
        async (tx) => {
          // Generate tenant ID before inserting the tenant.
          const tenantId = randomUUID();

          // Set tenant context before INSERT.
          // This allows the existing Tenant RLS policy to validate the row.
          await tx.$queryRaw`
  SELECT set_config('app.tenant_id', ${tenantId}, true)
`;

          // Create tenant using the pre-generated ID.
          const tenant = await tx.tenant.create({
            data: {
              id: tenantId,
              name,
              slug,
            },
          });

          // Seed global permission catalog idempotently.
          const permissionKeys = Object.values(PERMISSIONS);

          const permissions = await Promise.all(
            permissionKeys.map((key) =>
              tx.permission.upsert({
                where: { key },
                update: {},
                create: {
                  key,
                  description: key.replace(/[:_-]/g, ' '),
                },
                select: {
                  id: true,
                  key: true,
                },
              }),
            ),
          );

          const permissionIdByKey = new Map(
            permissions.map((permission) => [permission.key, permission.id]),
          );

          // Create default tenant roles.
          const [ownerRole, adminRole, memberRole] = await Promise.all([
            tx.role.create({
              data: {
                tenantId: tenant.id,
                name: 'OWNER',
                description: 'Full control over the tenant',
                isSystem: true,
              },
            }),
            tx.role.create({
              data: {
                tenantId: tenant.id,
                name: 'ADMIN',
                description: 'Tenant administration',
                isSystem: true,
              },
            }),
            tx.role.create({
              data: {
                tenantId: tenant.id,
                name: 'MEMBER',
                description: 'Standard tenant member',
                isSystem: true,
              },
            }),
          ]);

          // Create the creator's membership.
          const membership = await tx.membership.create({
            data: {
              tenantId: tenant.id,
              userId,
              status: 'ACTIVE',
            },
          });

          // Assign OWNER role to the creator.
          await tx.membershipRole.create({
            data: {
              tenantId: tenant.id,
              membershipId: membership.id,
              roleId: ownerRole.id,
            },
          });

          // Assign permissions to default roles.
          const rolePermissionData = [
            ...OWNER_PERMISSIONS.map((key) => ({
              tenantId: tenant.id,
              roleId: ownerRole.id,
              permissionId: permissionIdByKey.get(key)!,
            })),
            ...ADMIN_PERMISSIONS.map((key) => ({
              tenantId: tenant.id,
              roleId: adminRole.id,
              permissionId: permissionIdByKey.get(key)!,
            })),
            ...MEMBER_PERMISSIONS.map((key) => ({
              tenantId: tenant.id,
              roleId: memberRole.id,
              permissionId: permissionIdByKey.get(key)!,
            })),
          ];

          await tx.rolePermission.createMany({
            data: rolePermissionData,
          });

          // Record onboarding in the audit log.
          await tx.auditLog.create({
            data: {
              tenantId: tenant.id,
              actorUserId: userId,
              action: 'tenant.created',
              status: 'SUCCESS',
              resourceType: 'TENANT',
              resourceId: tenant.id,
              metadata: {
                tenantName: tenant.name,
                tenantSlug: tenant.slug,
                ownerMembershipId: membership.id,
              },
            },
          });

          return {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            createdAt: tenant.createdAt,
            membership: {
              id: membership.id,
              status: membership.status,
              role: ownerRole.name,
            },
          };
        },
        {
          maxWait: 5000,
          timeout: 15000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug is already taken');
      }

      throw error;
    }
  }

  private generateSlug(value: string): string {
    return value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
