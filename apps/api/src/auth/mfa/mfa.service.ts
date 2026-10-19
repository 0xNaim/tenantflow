import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VerifyMfaChallengeDto } from './dto/verify-mfa-challenge.dto.js';
import { MfaCryptoService } from './mfa-crypto.service.js';

const RECOVERY_CODE_COUNT = 10;

interface MfaChallengePayload extends JwtPayload {
  sub: string;
  purpose: 'mfa_challenge';
  jti: string;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: MfaCryptoService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private hashRecoveryCode(code: string): string {
    return createHash('sha256')
      .update(code.replace(/-/g, '').toUpperCase())
      .digest('hex');
  }

  async enrollTotp(userId: string) {
    const activeFactor = await this.prisma.mfaFactor.findFirst({
      where: {
        userId,
        type: 'TOTP',
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (activeFactor) {
      throw new ConflictException('TOTP is already enabled');
    }

    const secret = authenticator.generateSecret();
    const issuer = this.config.getOrThrow<string>('MFA_ISSUER');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const otpAuthUrl = authenticator.keyuri(user.email, issuer, secret);

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Replace any abandoned pending enrollment.
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaFactor.deleteMany({
        where: {
          userId,
          type: 'TOTP',
          status: 'PENDING',
        },
      });

      await tx.mfaFactor.create({
        data: {
          userId,
          type: 'TOTP',
          status: 'PENDING',
          secretEncrypted: this.crypto.encrypt(secret),
        },
      });
    });

    // The secret is returned only for enrollment.
    // Do not log this response or store it in Postman permanently.
    return {
      qrCodeDataUrl,
      manualEntryKey: secret,
      message: 'Scan the QR code, then confirm with a current TOTP code.',
    };
  }

  async confirmTotp(userId: string, code: string) {
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException('Invalid verification code');
    }

    const factor = await this.prisma.mfaFactor.findFirst({
      where: {
        userId,
        type: 'TOTP',
        status: 'PENDING',
      },
      select: { id: true, secretEncrypted: true },
    });

    if (!factor?.secretEncrypted) {
      throw new BadRequestException('No pending TOTP enrollment');
    }

    const secret = this.crypto.decrypt(factor.secretEncrypted);

    if (!authenticator.check(code, secret)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
      randomBytes(8).toString('hex').toUpperCase(),
    );

    await this.prisma.$transaction(async (tx) => {
      const activated = await tx.mfaFactor.updateMany({
        where: {
          id: factor.id,
          userId,
          status: 'PENDING',
        },
        data: {
          status: 'ACTIVE',
          confirmedAt: new Date(),
        },
      });

      if (activated.count !== 1) {
        throw new ConflictException('TOTP enrollment has already changed');
      }

      await tx.recoveryCode.createMany({
        data: recoveryCodes.map((code) => ({
          mfaFactorId: factor.id,
          codeHash: this.hashRecoveryCode(code),
        })),
      });
    });

    // Show plaintext recovery codes only once.
    return {
      message: 'Two-factor authentication enabled',
      recoveryCodes,
    };
  }

  async verifyChallenge(dto: VerifyMfaChallengeDto): Promise<string> {
    const secret = this.config.getOrThrow<string>('JWT_MFA_CHALLENGE_SECRET');

    let payload: MfaChallengePayload;

    try {
      payload = await this.jwt.verifyAsync<MfaChallengePayload>(
        dto.challengeToken,
        {
          secret,
          algorithms: ['HS256'],
          issuer: this.config.getOrThrow<string>('JWT_ISSUER'),
          audience: 'tenantflow-mfa-challenge',
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }

    if (
      payload.purpose !== 'mfa_challenge' ||
      typeof payload.sub !== 'string' ||
      typeof payload.jti !== 'string'
    ) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    const userId = payload.sub;
    const challengeId = payload.jti;

    const factor = await this.prisma.mfaFactor.findFirst({
      where: {
        userId,
        type: 'TOTP',
        status: 'ACTIVE',
      },
    });

    if (!factor) {
      throw new UnauthorizedException('MFA factor is not active');
    }

    if (dto.method === 'totp') {
      await this.verifyTotpOnce(userId, factor, dto.code);
    } else if (dto.method === 'recovery') {
      await this.consumeRecoveryCode(factor.id, dto.code);
    } else {
      throw new UnauthorizedException('Invalid MFA method');
    }

    const consumed = await this.prisma.mfaChallenge.updateMany({
      where: {
        id: challengeId,
        userId,
        expiresAt: {
          gt: new Date(),
        },
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException(
        'MFA challenge has expired or already been used',
      );
    }

    return userId;
  }

  private async verifyTotpOnce(
    userId: string,
    factor: {
      id: string;
      secretEncrypted: string | null;
      lastUsedStep: number | null;
    },
    code: string,
  ): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    if (!factor.secretEncrypted) {
      throw new UnauthorizedException('MFA factor is not active');
    }

    const secret = this.crypto.decrypt(factor.secretEncrypted);
    const delta = authenticator.checkDelta(code, secret);

    if (delta === null) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    const acceptedStep = Math.floor(Date.now() / 30_000) + delta;

    const result = await this.prisma.mfaFactor.updateMany({
      where: {
        id: factor.id,
        userId,
        status: 'ACTIVE',
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: acceptedStep } }],
      },
      data: {
        lastUsedStep: acceptedStep,
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException(
        'MFA code has already been used or is no longer valid',
      );
    }
  }

  private async consumeRecoveryCode(
    mfaFactorId: string,
    code: string,
  ): Promise<void> {
    const normalized = code.replace(/-/g, '').toUpperCase();

    if (!/^[A-F0-9]{16}$/.test(normalized)) {
      throw new UnauthorizedException('Invalid recovery code');
    }

    const codeHash = this.hashRecoveryCode(normalized);

    const result = await this.prisma.recoveryCode.updateMany({
      where: {
        mfaFactorId,
        codeHash,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new UnauthorizedException('Invalid or already used recovery code');
    }
  }
}
