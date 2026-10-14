import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { EmailService } from './email.service.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.accessTtlSeconds = Number(
      this.config.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
    );

    this.refreshTtlDays = Number(
      this.config.getOrThrow<string>('REFRESH_TOKEN_TTL_DAYS'),
    );

    if (
      !Number.isInteger(this.accessTtlSeconds) ||
      this.accessTtlSeconds < 60 ||
      !Number.isInteger(this.refreshTtlDays) ||
      this.refreshTtlDays < 1
    ) {
      throw new Error('Invalid authentication token lifetime configuration');
    }
  }

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
        message: 'Verification instructions have been sent to this address.',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return {
          message: 'Verification instructions have been sent to this address.',
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

  async login(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        emailVerifiedAt: true,
      },
    });

    // Verify even when the email does not exist, reducing
    // the timing difference between unknown and known accounts.
    const validPassword = await this.passwords.verify(
      user?.passwordHash ?? '$argon2id$invalid-placeholder',
      password,
    );

    if (!user || !validPassword || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const now = new Date();
    const sessionExpiresAt = new Date(
      now.getTime() + this.refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const familyId = randomUUID();

    const session = await this.prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          userId: user.id,
          status: 'ACTIVE',
          expiresAt: sessionExpiresAt,
          lastSeenAt: now,
        },
        select: { id: true },
      });

      await tx.refreshToken.create({
        data: {
          sessionId: createdSession.id,
          familyId,
          tokenHash: this.hashToken(refreshToken),
          expiresAt: sessionExpiresAt,
        },
      });

      return createdSession;
    });

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        sid: session.id,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtlSeconds,
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
    };
  }

  async refresh(rawToken: string) {
    if (
      typeof rawToken !== 'string' ||
      rawToken.length < 32 ||
      rawToken.length > 200
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    const nextToken = randomBytes(32).toString('base64url');

    const outcome = await this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          sessionId: true,
          familyId: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          session: {
            select: {
              userId: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      });

      if (!current) {
        return { kind: 'invalid' as const };
      }

      // Reuse of a previously consumed token is suspicious.
      if (current.usedAt || current.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        });

        await tx.session.updateMany({
          where: { id: current.sessionId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now },
        });

        return { kind: 'reuse' as const };
      }

      if (
        current.expiresAt <= now ||
        current.session.status !== 'ACTIVE' ||
        current.session.expiresAt <= now
      ) {
        return { kind: 'invalid' as const };
      }

      const created = await tx.refreshToken.create({
        data: {
          sessionId: current.sessionId,
          familyId: current.familyId,
          tokenHash: this.hashToken(nextToken),
          expiresAt: current.session.expiresAt,
        },
        select: { id: true },
      });

      // Compare-and-set: only one concurrent request may consume it.
      const consumed = await tx.refreshToken.updateMany({
        where: {
          id: current.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          usedAt: now,
          replacedById: created.id,
        },
      });

      if (consumed.count !== 1) {
        await tx.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        });

        await tx.session.updateMany({
          where: { id: current.sessionId, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: now },
        });

        return { kind: 'reuse' as const };
      }

      return {
        kind: 'success' as const,
        userId: current.session.userId,
        sessionId: current.sessionId,
      };
    });

    if (outcome.kind !== 'success') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: outcome.userId,
        sid: outcome.sessionId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.accessTtlSeconds,
        issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
        audience: this.config.getOrThrow<string>('JWT_AUDIENCE'),
      },
    );

    return {
      accessToken,
      refreshToken: nextToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
    };
  }

  async logout(userId: string, sessionId: string) {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: {
          id: sessionId,
          userId,
          status: 'ACTIVE',
        },
        data: {
          status: 'REVOKED',
          revokedAt: now,
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });
    });

    return { message: 'Logged out successfully' };
  }
}
