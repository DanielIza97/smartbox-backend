import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get(MetricsService);
    service.onModuleInit();
  });

  it('expone las métricas por defecto del proceso además del histograma HTTP', async () => {
    const metrics = await service.getMetrics();

    expect(metrics).toContain('process_cpu_user_seconds_total');
  });

  it('registra observaciones del histograma http_request_duration_seconds con sus labels', async () => {
    service.observeHttpRequest('GET', '/health', 200, 0.05);

    const metrics = await service.getMetrics();

    expect(metrics).toContain('http_request_duration_seconds');
    expect(metrics).toContain('method="GET"');
    expect(metrics).toContain('route="/health"');
    expect(metrics).toContain('status_code="200"');
  });

  it('expone un content type compatible con Prometheus', () => {
    expect(service.getContentType()).toContain('text/plain');
  });
});
