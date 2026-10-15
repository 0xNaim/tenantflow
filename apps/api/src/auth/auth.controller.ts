import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(
    @Req()
    req: Request & {
      user: { userId: string; sessionId: string };
    },
  ) {
    return this.authService.logout(req.user.userId, req.user.sessionId);
  }

  @Throttle({ default: { limit: 3, ttl: 900_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  listSessions(
    @Req()
    req: Request & {
      user: { userId: string; sessionId: string };
    },
  ) {
    return this.authService.listSessions(req.user.userId, req.user.sessionId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @Req()
    req: Request & {
      user: { userId: string; sessionId: string };
    },
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(req.user.userId, sessionId);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logoutAll(
    @Req()
    req: Request & {
      user: { userId: string; sessionId: string };
    },
  ) {
    return this.authService.logoutAllSessions(req.user.userId);
  }
}
