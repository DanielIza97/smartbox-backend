import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class JoinWaitlistDto {
  @ApiProperty({ description: 'UUID de la clase/recurso lleno' })
  @IsUUID()
  classId!: string;

  @ApiProperty({
    description:
      'Horario del turno (ISO 8601), debe coincidir con una ocurrencia real del patrón recurrente de la clase',
  })
  @IsDateString()
  startAt!: string;
}
