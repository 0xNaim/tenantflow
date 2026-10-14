import { Controller, Get, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { RequirePermissions } from '../authorization/require-permissions.decorator.js';

@Controller('projects')
@UseGuards(PermissionsGuard)
export class ProjectsController {
  @Get()
  @RequirePermissions('project:read')
  findAll() {
    return { message: 'Authorized project access' };
  }
}
