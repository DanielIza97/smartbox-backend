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
import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

// Horarios de trabajo del STAFF (E4-02) — operativo, no cara al socio: sin
// rol CLIENT en ningún endpoint acá.
@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @ApiOperation({
    summary: 'Crear un turno de trabajo recurrente para un STAFF',
  })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateShiftDto, @Request() req: RequestWithUser) {
    return this.shiftsService.create(dto, req.user!);
  }

  @ApiOperation({
    summary:
      'Listar turnos de trabajo (ADMIN/STAFF ven solo los de su gimnasio)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.shiftsService.findAll(req.user!);
  }

  @ApiOperation({ summary: 'Obtener un turno por id' })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.shiftsService.findOne(id, req.user!);
  }
}
