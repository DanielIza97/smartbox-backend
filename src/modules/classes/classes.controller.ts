import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

// Turnos recurrentes semanales (clases/recursos) de un gimnasio. Gestión
// (alta) restringida a SUPER_ADMIN/ADMIN, igual que Plan — lectura abierta
// a cualquier rol autenticado para que un CLIENT vea la grilla antes de
// reservar.
@ApiTags('classes')
@ApiBearerAuth()
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @ApiOperation({
    summary: 'Crear un turno recurrente semanal (clase/recurso)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: CreateClassDto, @Request() req: RequestWithUser) {
    const requester = req.user!;
    if (requester.role !== 'SUPER_ADMIN') {
      dto.gymId = requester.gymId ?? undefined;
    }
    return this.classesService.create(dto);
  }

  @ApiOperation({
    summary:
      'Listar clases/recursos (ADMIN/STAFF/CLIENT ven solo las de su gimnasio)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.classesService.findAll(req.user!);
  }

  @ApiOperation({ summary: 'Obtener una clase/recurso por id' })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.classesService.findOne(id, req.user!);
  }

  @ApiOperation({
    summary:
      'Turnos disponibles de una clase/recurso en un rango de fechas (E3-02)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.classesService.getAvailability(id, req.user!, query);
  }
}
