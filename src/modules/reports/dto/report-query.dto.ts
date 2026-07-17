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
}
