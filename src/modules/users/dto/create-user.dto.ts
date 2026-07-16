import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Ada Lovelace' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'ada@smartbox.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'contraseñaSegura123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ description: 'UUID del rol a asignar' })
  @IsOptional()
  @IsString()
  roleId?: string;
}
