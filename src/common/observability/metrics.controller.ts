import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

// Pública, sin JWT (E5-04) — la scrapea Prometheus, no un cliente de la
// API. Excluida de Swagger porque no es un recurso REST normal, mismo
// criterio que el webhook de Mercado Pago.
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @ApiExcludeEndpoint()
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metricsService.getContentType());
    res.send(await this.metricsService.getMetrics());
  }
}
