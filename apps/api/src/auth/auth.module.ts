import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailService } from './email.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { MfaCryptoService } from './mfa/mfa-crypto.service.js';
import { MfaController } from './mfa/mfa.controller.js';
import { MfaService } from './mfa/mfa.service.js';
import { PasswordService } from './password.service.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    JwtModule.register({}),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 20,
      },
    ]),
  ],
  providers: [
    AuthService,
    PasswordService,
    EmailService,
    JwtStrategy,
    MfaService,
    MfaCryptoService,
  ],
  controllers: [AuthController, MfaController],
  exports: [AuthService],
})
export class AuthModule {}
