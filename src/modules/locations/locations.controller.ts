import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

// Sucursales (Fase 1 post-v1.5) — ubicaciones físicas de un gimnasio.
// Gestión (alta) restringida a SUPER_ADMIN/ADMIN, igual que Classes/Shifts;
// lectura abierta a cualquier rol autenticado (CLIENT la necesita para el
// filtro de sucursal del catálogo de clases en el portal).
@ApiTags('locations')
@ApiBearerAuth()
@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @ApiOperation({ summary: 'Crear una sucursal' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateLocationDto, @Request() req: RequestWithUser) {
    const requester = req.user!;
    if (requester.role !== 'SUPER_ADMIN') {
      dto.gymId = requester.gymId ?? undefined;
    }
    return this.locationsService.create(dto);
  }

  @ApiOperation({
    summary:
      'Listar sucursales (ADMIN/STAFF/CLIENT ven solo las de su gimnasio)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.locationsService.findAll(req.user!);
  }
}
