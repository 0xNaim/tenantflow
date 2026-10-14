import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { ProjectsController } from './projects.controller.js';

@Module({
  imports: [TenancyModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
