import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { SettlementSyncService } from './settlement-sync.service';
import { SettlementSyncAdminController } from './settlement-sync-admin.controller';
import { SorobanEventsService } from './soroban-events.service';
import { SyncCursorService } from './sync-cursor.service';
import { SettlementController } from './settlement.controller';

@Module({
  controllers: [SettlementController, SettlementSyncAdminController],
  providers: [
    SettlementService,
    SettlementSyncService,
    SorobanEventsService,
    SyncCursorService,
  ],
  exports: [SettlementService],
})
export class SettlementModule {}
