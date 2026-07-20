import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// E6-05 (Epic 6, v1.5): onboarding self-serve — un dueño de gimnasio
// prospecto da de alta su propio gimnasio y su cuenta ADMIN en un solo
// paso, sin pasar por SUPER_ADMIN.
export class SignupGymDto {
  @ApiProperty({ example: 'PowerFit Norte' })
  @IsString()
  @MinLength(2)
  gymName!: string;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'America/Guayaquil', default: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  ownerName!: string;

  @ApiProperty({ example: 'ada@powerfit.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'contraseñaSegura123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;
}
