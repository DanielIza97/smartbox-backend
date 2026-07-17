import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { LoggingMiddleware } from './logging.middleware';

@Module({
  providers: [MetricsService, LoggingMiddleware],
  controllers: [MetricsController],
  exports: [MetricsService, LoggingMiddleware],
})
export class ObservabilityModule {}
