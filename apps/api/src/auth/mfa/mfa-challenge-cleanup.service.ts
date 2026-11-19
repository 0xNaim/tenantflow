import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class MfaChallengeCleanupService {
  private readonly logger = new Logger(MfaChallengeCleanupService.name);

  constructor(private readonly prismaService: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'mfa-challenge-cleanup' })
  async scheduledCleanup(): Promise<void> {
    try {
      await this.cleanupExpiredChallenges();
    } catch (error) {
      this.logger.error(
        'Expired MFA challenge cleanup failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async cleanupExpiredChallenges(now: Date = new Date()): Promise<number> {
    const result = await this.prismaService.mfaChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} expired MFA challenges`);
    }

    return result.count;
  }
}
