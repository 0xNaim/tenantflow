import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { TenantsService } from './tenants.service.js';

interface AuthenticatedRequest {
  user: {
    userId: string;
    sessionId: string;
  };
}

@Controller('tenants')
@UseGuards(AuthGuard('jwt'))
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(req.user.userId, dto);
  }
}
