import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateShiftDto {
  @ApiProperty({ description: 'UUID del usuario STAFF dueño del turno' })
  @IsUUID()
  staffId!: string;

  @ApiProperty({
    example: 1,
    description: 'Día de la semana del turno (0=domingo..6=sábado)',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({
    example: '09:00',
    description: 'Hora de inicio, formato HH:mm',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime debe tener formato HH:mm (24hs)',
  })
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'Hora de fin, formato HH:mm' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime debe tener formato HH:mm (24hs)',
  })
  endTime!: string;
}
