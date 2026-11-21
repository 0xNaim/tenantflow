import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
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

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.tenantsService.findAll(req.user.userId);
  }

  @Get(':tenantId')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('tenantId') tenantId: string,
  ) {
    return this.tenantsService.findOne(req.user.userId, tenantId);
  }

  @Patch(':tenantId')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(req.user.userId, tenantId, dto);
  }
}
