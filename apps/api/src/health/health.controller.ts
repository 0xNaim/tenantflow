import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    const results = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    const databaseReady = results[0].status === 'fulfilled';
    const redisReady =
      results[1].status === 'fulfilled' && results[1].value === 'PONG';

    const response = {
      status: databaseReady && redisReady ? 'ok' : 'degraded',
      dependencies: {
        database: databaseReady ? 'ok' : 'unavailable',
        redis: redisReady ? 'ok' : 'unavailable',
      },
    };

    if (!databaseReady || !redisReady) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
