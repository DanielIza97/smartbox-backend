import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({
    description: 'Desde cuándo (ISO 8601). Por defecto, hace 7 días.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Hasta cuándo (ISO 8601). Por defecto, ahora.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'UUID del gimnasio a reportar. Obligatorio solo para SUPER_ADMIN — ADMIN/STAFF siempre ven el propio.',
  })
  @IsOptional()
  @IsUUID()
  gymId?: string;

  @ApiPropertyOptional({
    description:
      'UUID de la sucursal a filtrar (Fase 1 post-v1.5). En /occupancy filtra las clases de esa sucursal (exacto). En /revenue y /finance, como los planes de membresía dan acceso a todas las sucursales del gym, agrega una estimación proporcional según los check-ins de esa sucursal en el rango — no es el monto real cobrado ahí.',
  })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
