import { Module } from '@nestjs/common';
import { TenantTransactionService } from './tenant-transaction.service.js';

@Module({
  providers: [TenantTransactionService],
  exports: [TenantTransactionService],
})
export class TenancyModule {}
