import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ada@smartbox.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'contraseñaSegura123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @ApiPropertyOptional({
    description: 'Solo para registros internos (ADMIN, STAFF, etc.)',
    example: 'STAFF',
  })
  @IsString()
  @IsOptional()
  roleName?: string;
}
