import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailService } from './email.service.js';
import { PasswordService } from './password.service.js';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [AuthService, PasswordService, EmailService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
