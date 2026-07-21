import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // Requiere sesión (no rol específico) — lo usa el selector de rol de
  // /dashboard/users, no tiene motivo para ser público. Antes no tenía
  // ningún guard: exponía el UUID de SUPER_ADMIN a cualquiera sin login,
  // el primer paso de la escalación de privilegios corregida en
  // UsersService.update().
  @ApiOperation({ summary: 'Listar los roles del sistema' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }
}
