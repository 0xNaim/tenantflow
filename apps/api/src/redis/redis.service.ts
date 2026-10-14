import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    public readonly client: Redis,
  ) {
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis client error: ${error.message}`);
    });

    this.client.on('ready', () => {
      this.logger.log('Redis connection is ready');
    });

    this.client.on('reconnecting', (delay: number) => {
      this.logger.warn(`Redis reconnecting in ${delay}ms`);
    });
  }

  async onModuleInit(): Promise<void> {
    if (this.client.status === 'ready') {
      return;
    }

    if (this.client.status !== 'wait') {
      throw new Error(
        `Cannot initialize Redis from state: ${this.client.status}`,
      );
    }

    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') {
      return;
    }

    if (this.client.status !== 'ready') {
      this.client.disconnect();
      return;
    }

    try {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    } catch (error) {
      this.logger.warn(
        `Graceful Redis shutdown failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }. Forcing disconnect.`,
      );

      this.client.disconnect();
    }
  }
}
