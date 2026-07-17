import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: { check: jest.Mock };
  let typeOrmIndicator: { pingCheck: jest.Mock };

  beforeEach(async () => {
    healthCheckService = { check: jest.fn() };
    typeOrmIndicator = { pingCheck: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: TypeOrmHealthIndicator, useValue: typeOrmIndicator },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('delega en HealthCheckService.check con un pingCheck de la conexión "database"', async () => {
    healthCheckService.check.mockImplementation(
      async (checks: Array<() => Promise<unknown>>) => {
        const results = await Promise.all(checks.map((check) => check()));
        return { status: 'ok', results };
      },
    );
    typeOrmIndicator.pingCheck.mockResolvedValue({
      database: { status: 'up' },
    });

    const result = await controller.check();

    expect(typeOrmIndicator.pingCheck).toHaveBeenCalledWith('database');
    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        results: [{ database: { status: 'up' } }],
      }),
    );
  });
});
