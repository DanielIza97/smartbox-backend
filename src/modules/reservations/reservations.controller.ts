import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @ApiOperation({
    summary: 'Reservar un turno — valida membresía activa, cupo y solapamiento',
  })
  @Roles('CLIENT')
  @Post()
  create(@Body() dto: CreateReservationDto, @Request() req: RequestWithUser) {
    return this.reservationsService.create(dto, req.user!);
  }

  @ApiOperation({
    summary: 'Listar reservas (CLIENT ve las propias, ADMIN/STAFF las del gym)',
  })
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CLIENT')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.reservationsService.findAll(req.user!);
  }

  @ApiOperation({ summary: 'Cancelar una reserva' })
  @Roles('CLIENT', 'ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.reservationsService.cancel(id, req.user!);
  }
}
