import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

// Múltiples planes mensuales por gimnasio (niveles, E6-04) — sin PUT/DELETE
// todavía, mismo alcance minimalista que el resto de los catálogos (Class,
// Shift): la entidad y el alta, se agrega si una historia futura lo pide.
@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @ApiOperation({ summary: 'Crear un plan de membresía para un gimnasio' })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreatePlanDto, @Request() req: RequestWithUser) {
    const requester = req.user!;
    if (requester.role !== 'SUPER_ADMIN') {
      dto.gymId = requester.gymId ?? undefined;
    }
    return this.plansService.create(dto);
  }

  @ApiOperation({
    summary: 'Listar planes (ADMIN/STAFF/CLIENT ven solo el de su gimnasio)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.plansService.findAll(req.user!);
  }

  @ApiOperation({ summary: 'Obtener un plan por id' })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.plansService.findOne(id, req.user!);
  }
}
