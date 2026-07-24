import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLocationDto {
  @ApiProperty({ example: 'Sucursal Norte' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description:
      'UUID del gimnasio dueño de la sucursal. Obligatorio solo para SUPER_ADMIN — un ADMIN siempre crea la sucursal de su propio gimnasio.',
  })
  @IsOptional()
  @IsUUID()
  gymId?: string;
}
