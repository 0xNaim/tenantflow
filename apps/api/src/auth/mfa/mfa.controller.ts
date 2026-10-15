import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../jwt-auth.guard.js';
import { ConfirmTotpDto } from './dto/confirm-totp.dto.js';
import { MfaService } from './mfa.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    sessionId: string;
  };
}

@Controller('auth/mfa/totp')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  enroll(@Req() req: AuthenticatedRequest) {
    return this.mfaService.enrollTotp(req.user.userId);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: AuthenticatedRequest, @Body() dto: ConfirmTotpDto) {
    return this.mfaService.confirmTotp(req.user.userId, dto.code);
  }
}
