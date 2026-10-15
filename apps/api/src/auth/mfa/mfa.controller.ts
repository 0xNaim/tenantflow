import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import { ConfirmTotpDto } from './dto/confirm-totp.dto.js';
import { VerifyMfaChallengeDto } from './dto/verify-mfa-challenge.dto.js';
import { MfaService } from './mfa.service.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    sessionId: string;
  };
}

@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly authService: AuthService,
  ) {}

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

  @Post('challenge/verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(@Body() dto: VerifyMfaChallengeDto) {
    const userId = await this.mfaService.verifyChallenge(dto);

    return this.authService.completeMfaLogin(userId);
  }
}
