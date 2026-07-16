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

// Un solo plan mensual por gimnasio (Recomendación 3). Sin PUT/DELETE
// todavía — el alcance de E2-01 es la entidad y el alta inicial.
@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @ApiOperation({ summary: 'Crear el plan mensual de un gimnasio' })
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
