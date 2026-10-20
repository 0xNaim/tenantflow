import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service.js';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])

if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end

local ttl = redis.call('PTTL', KEYS[1])

return { count, ttl }
`;

@Injectable()
export class MfaRateLimitService {
  constructor(private readonly redisService: RedisService) {}

  async consume(key: string, limit: number, windowMs: number): Promise<void> {
    const redis = this.redisService.getClient();

    const result = (await redis.eval(RATE_LIMIT_SCRIPT, 1, key, windowMs)) as [
      number,
      number,
    ];

    const [count, ttl] = result;

    if (count > limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
