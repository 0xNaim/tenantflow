import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantTransactionService } from '../tenancy/tenant-transaction.service.js';
import { PermissionKey } from './permissions.constants.js';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator.js';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    userId?: string;
  };
  tenantId?: string;
  params: Record<string, string | undefined>;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantTransactionService: TenantTransactionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // Endpoints without permission metadata are not restricted
    // by this guard. Authentication must be enforced separately.
    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = request.user?.sub ?? request.user?.userId;
    const tenantId = request.tenantId ?? request.params.tenantId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const hasAllPermissions =
      await this.tenantTransactionService.withTenantContext(
        userId,
        tenantId,
        async (tx) => {
          const membership = await tx.membership.findFirst({
            where: {
              userId,
              tenantId,
              status: 'ACTIVE',
            },
            select: { id: true },
          });

          if (!membership) {
            return false;
          }

          const assignments = await tx.membershipRole.findMany({
            where: {
              tenantId,
              membershipId: membership.id,
            },
            select: { roleId: true },
          });

          const roleIds = assignments.map(({ roleId }) => roleId);

          if (roleIds.length === 0) {
            return false;
          }

          const rolePermissions = await tx.rolePermission.findMany({
            where: {
              tenantId,
              roleId: { in: roleIds },
            },
            select: { permissionId: true },
          });

          const permissionIds = [
            ...new Set(rolePermissions.map(({ permissionId }) => permissionId)),
          ];

          if (permissionIds.length === 0) {
            return false;
          }

          const permissions = await tx.permission.findMany({
            where: {
              id: { in: permissionIds },
            },
            select: { key: true },
          });

          const granted = new Set(permissions.map(({ key }) => key));

          return requiredPermissions.every((permission) =>
            granted.has(permission),
          );
        },
      );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
