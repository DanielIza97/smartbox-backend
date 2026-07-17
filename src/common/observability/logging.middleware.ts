import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context';
import { MetricsService } from './metrics.service';

// Logging estructurado con correlation id por request (E5-02) + registro de
// la métrica http_request_duration_seconds (E5-04) en un solo lugar, para
// no duplicar la lectura de método/ruta/status en dos capas distintas.
//
// Escucha `res.on('finish')` en vez de loguear en un interceptor: así el
// status code y la duración son siempre los reales, incluso cuando la
// respuesta la termina un exception filter (SentryGlobalFilter incluido)
// después de que el handler ya lanzó — un interceptor con `tap` vería el
// status code por defecto (200) en el camino de error, no el final.
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) || randomUUID();
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const route: string =
        (req.route as { path?: string } | undefined)?.path ?? req.path;

      this.metricsService.observeHttpRequest(
        req.method,
        route,
        res.statusCode,
        durationMs / 1000,
      );

      this.logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs,
        }),
      );
    });

    RequestContext.run({ requestId }, next);
  }
}
