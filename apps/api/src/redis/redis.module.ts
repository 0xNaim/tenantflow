import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: (times) => Math.min(times * 200, 2000),
        }),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
