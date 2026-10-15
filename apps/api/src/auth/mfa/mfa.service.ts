import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MfaCryptoService } from './mfa-crypto.service.js';

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: MfaCryptoService,
    private readonly config: ConfigService,
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
}
