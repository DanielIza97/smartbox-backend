import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

// Registry propio en vez del global de prom-client — evita que tests que
// instancian el servicio más de una vez choquen por métricas duplicadas
// registradas en el registry por defecto del proceso.
@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new client.Registry();

  private readonly httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de los requests HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });

  onModuleInit(): void {
    client.collectDefaultMetrics({ register: this.registry });
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      durationSeconds,
    );
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
