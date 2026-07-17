import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiPropertyOptional({
    description:
      'Desde cuándo buscar turnos disponibles (ISO 8601). Por defecto, ahora.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Hasta cuándo buscar turnos disponibles (ISO 8601). Por defecto, 14 días desde "from".',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
