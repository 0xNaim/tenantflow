import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permissions.constants.js';

export const REQUIRED_PERMISSIONS = 'required_permissions';

export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
