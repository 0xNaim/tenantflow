import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    TenancyModule,
    ProjectsModule,
    AuthModule,
  ],
})
export class AppModule {}
