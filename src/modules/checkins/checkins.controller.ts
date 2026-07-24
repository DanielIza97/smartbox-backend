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
import { CheckInsService } from './checkins.service';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('checkins')
@ApiBearerAuth()
@Controller('checkins')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CheckInsController {
  constructor(private readonly checkInsService: CheckInsService) {}

  @ApiOperation({
    summary:
      'Registrar un check-in físico — CLIENT se registra a sí mismo, STAFF/ADMIN/SUPER_ADMIN registran a otro socio',
  })
  @Roles('CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN')
  @Post()
  checkIn(@Body() dto: CreateCheckInDto, @Request() req: RequestWithUser) {
    return this.checkInsService.checkIn(dto, req.user!);
  }

  @ApiOperation({ summary: 'Registrar el check-out de un check-in activo' })
  @Roles('CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/checkout')
  checkOut(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.checkInsService.checkOut(id, req.user!);
  }

  @ApiOperation({
    summary:
      'Listar check-ins (CLIENT ve los propios, ADMIN/STAFF los del gym)',
  })
  @Roles('CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN')
  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.checkInsService.findAll(req.user!);
  }
}
