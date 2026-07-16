import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'Plan mensual' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 4999, description: 'Precio en centavos (USD)' })
  @IsInt()
  @Min(1)
  priceCents!: number;

  @ApiPropertyOptional({
    description:
      'UUID del gimnasio dueño del plan. Obligatorio solo para SUPER_ADMIN — un ADMIN siempre crea el plan de su propio gimnasio.',
  })
  @IsOptional()
  @IsUUID()
  gymId?: string;
}
