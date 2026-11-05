import { Module } from '@nestjs/common';
import { AnalyticsController, AnalyticsService } from './analytics';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
@Module({ controllers: [HistoryController, AnalyticsController], providers: [HistoryService, AnalyticsService] })
export class HistoryModule {}
