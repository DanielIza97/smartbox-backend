import { EventEmitter } from 'node:events';
import { LoggingMiddleware } from './logging.middleware';
import { RequestContext } from './request-context';
import { MetricsService } from './metrics.service';

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let metricsService: { observeHttpRequest: jest.Mock };

  beforeEach(() => {
    metricsService = { observeHttpRequest: jest.fn() };
    middleware = new LoggingMiddleware(
      metricsService as unknown as MetricsService,
    );
  });

  function fakeRequest(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      headers: {},
      method: 'GET',
      path: '/classes/class-1',
      originalUrl: '/classes/class-1',
      route: { path: '/classes/:id' },
      ...overrides,
    } as unknown as import('express').Request;
  }

  function fakeResponse() {
    const res = new EventEmitter() as EventEmitter & {
      setHeader: jest.Mock;
      statusCode: number;
    };
    res.setHeader = jest.fn();
    res.statusCode = 200;
    return res;
  }

  function asResponse(res: ReturnType<typeof fakeResponse>) {
    return res as unknown as import('express').Response;
  }

  it('genera un x-request-id si no viene en los headers y lo expone en la respuesta', () => {
    const req = fakeRequest();
    const res = fakeResponse();
    const next = jest.fn();

    middleware.use(req, asResponse(res), next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.any(String),
    );
    expect(next).toHaveBeenCalled();
  });

  it('reutiliza el x-request-id entrante en vez de generar uno nuevo', () => {
    const req = fakeRequest({ headers: { 'x-request-id': 'req-existente' } });
    const res = fakeResponse();
    const next = jest.fn();

    middleware.use(req, asResponse(res), next);

    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-existente');
  });

  it('deja el requestId disponible en el contexto async dentro de next()', () => {
    const req = fakeRequest({ headers: { 'x-request-id': 'req-ctx' } });
    const res = fakeResponse();
    let capturedRequestId: string | undefined;

    middleware.use(req, asResponse(res), () => {
      capturedRequestId = RequestContext.getRequestId();
    });

    expect(capturedRequestId).toBe('req-ctx');
  });

  it('registra la métrica http_request_duration_seconds cuando termina la respuesta', () => {
    const req = fakeRequest();
    const res = fakeResponse();

    middleware.use(req, asResponse(res), jest.fn());
    res.statusCode = 404;
    res.emit('finish');

    expect(metricsService.observeHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/classes/:id',
      404,
      expect.any(Number),
    );
  });

  it('usa req.path como fallback si la ruta todavía no matcheó (p. ej. 404 real)', () => {
    const req = fakeRequest({ route: undefined, path: '/no-existe' });
    const res = fakeResponse();

    middleware.use(req, asResponse(res), jest.fn());
    res.statusCode = 404;
    res.emit('finish');

    expect(metricsService.observeHttpRequest).toHaveBeenCalledWith(
      'GET',
      '/no-existe',
      404,
      expect.any(Number),
    );
  });
});
