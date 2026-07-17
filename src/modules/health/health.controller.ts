import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

// Pública, sin JWT (E5-01) — la consumen balanceadores de carga y monitores
// de uptime externos, no tiene sentido pedirles un token. Solo chequea
// Postgres por ahora: Redis y MQTT todavía no tienen ningún módulo que los
// use en el código (ver CLAUDE.md) — se suman acá cuando existan.
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @ApiOperation({ summary: 'Estado de salud del servicio (Postgres)' })
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
