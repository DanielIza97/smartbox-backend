import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

// Lo que un usuario puede editar de sí mismo. Deliberadamente sin email ni
// roleId: el cambio de email tiene su propio flujo con verificación, y el
// rol solo lo puede tocar un ADMIN vía UpdateUserDto.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ada Lovelace' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
