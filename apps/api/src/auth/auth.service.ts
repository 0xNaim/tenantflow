import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { EmailService } from './email.service.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email;
    const passwordHash = await this.passwords.hash(dto.password);

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            passwordHash,
          },
          select: { id: true },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: createdUser.id,
            tokenHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        return createdUser;
      });

      try {
        await this.email.sendVerificationEmail(email, rawToken);
      } catch (error) {
        // Never log the raw verification token.
        this.logger.error(
          'Verification email delivery failed. A resend flow is needed.',
          error instanceof Error ? error.stack : undefined,
        );
      }

      return {
        message:
          'If this address can be registered, verification instructions will be sent.',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Same public response for duplicate email.
        return {
          message:
            'If this address can be registered, verification instructions will be sent.',
        };
      }

      throw error;
    }
  }

  async verifyEmail(rawToken: string) {
    if (
      typeof rawToken !== 'string' ||
      rawToken.length < 20 ||
      rawToken.length > 200
    ) {
      throw new BadRequestException('Invalid or expired token');
    }

    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    const verified = await this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findFirst({
        where: {
          tokenHash,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true, userId: true },
      });

      if (!token) {
        return false;
      }

      // Atomic one-time consumption prevents token replay.
      const consumed = await tx.emailVerificationToken.updateMany({
        where: {
          id: token.id,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });

      if (consumed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });

      return true;
    });

    if (!verified) {
      throw new BadRequestException('Invalid or expired token');
    }

    return { message: 'Email verified successfully' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
