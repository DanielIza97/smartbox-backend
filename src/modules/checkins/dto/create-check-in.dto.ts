import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateCheckInDto {
  @ApiPropertyOptional({
    description:
      'UUID de la reserva a la que corresponde este check-in (opcional — sin esto, es una visita libre sin clase asociada).',
  })
  @IsOptional()
  @IsUUID()
  reservationId?: string;

  @ApiPropertyOptional({
    description:
      'UUID del socio a registrar. Obligatorio para STAFF/ADMIN/SUPER_ADMIN (registran a otro); ignorado para CLIENT (siempre se registra a sí mismo).',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
