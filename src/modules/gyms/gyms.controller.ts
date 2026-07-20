import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GymsService } from './gyms.service';
import { CreateGymDto } from './dto/create-gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

// Alta y listado de gimnasios (tenants del SaaS) por SUPER_ADMIN. El
// onboarding self-serve (E6-05) es un flujo público aparte —
// POST /auth/signup-gym, no este endpoint — porque crea el Gym y su cuenta
// ADMIN dueña en un solo paso y necesita JwtService para auto-loguear al
// dueño (ver AuthService.signupGym()).
@ApiTags('gyms')
@ApiBearerAuth()
@Controller('gyms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @ApiOperation({ summary: 'Dar de alta un gimnasio nuevo (tenant)' })
  @Roles('SUPER_ADMIN')
  @Post()
  create(@Body() dto: CreateGymDto) {
    return this.gymsService.create(dto);
  }

  @ApiOperation({ summary: 'Listar los gimnasios del SaaS' })
  @Roles('SUPER_ADMIN')
  @Get()
  findAll() {
    return this.gymsService.findAll();
  }

  @ApiOperation({
    summary:
      'Obtener un gimnasio por id (ADMIN/STAFF solo pueden ver el propio)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    const requester = req.user!;
    if (requester.role !== 'SUPER_ADMIN' && requester.gymId !== id) {
      throw new ForbiddenException('No tenés acceso a este gimnasio.');
    }
    return this.gymsService.findOne(id);
  }

  @ApiOperation({
    summary:
      'Iniciar la conexión OAuth con Mercado Pago para este gimnasio (modelo Marketplace)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get(':id/mercadopago/connect')
  connectMercadoPago(@Param('id') id: string, @Request() req: RequestWithUser) {
    const requester = req.user!;
    if (requester.role !== 'SUPER_ADMIN' && requester.gymId !== id) {
      throw new ForbiddenException('No tenés acceso a este gimnasio.');
    }
    return this.gymsService.startMercadoPagoConnect(id);
  }
}
