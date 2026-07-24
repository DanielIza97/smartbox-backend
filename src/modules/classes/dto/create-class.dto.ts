import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: 'Yoga' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 15, description: 'Cupo máximo por turno' })
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiProperty({
    example: 1,
    description: 'Día de la semana del turno recurrente (0=domingo..6=sábado)',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({
    example: '09:00',
    description: 'Hora de inicio, formato HH:mm',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime debe tener formato HH:mm (24hs)',
  })
  startTime!: string;

  @ApiProperty({ example: 60, description: 'Duración del turno en minutos' })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiProperty({ description: 'UUID de la sucursal donde se dicta la clase' })
  @IsUUID()
  locationId!: string;

  @ApiPropertyOptional({
    description:
      'UUID del gimnasio dueño de la clase. Obligatorio solo para SUPER_ADMIN — un ADMIN siempre crea la clase de su propio gimnasio.',
  })
  @IsOptional()
  @IsUUID()
  gymId?: string;
}
