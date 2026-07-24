import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('waitlist')
@ApiBearerAuth()
@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @ApiOperation({
    summary: 'Anotarse en la lista de espera de un turno lleno',
  })
  @Roles('CLIENT')
  @Post()
  join(@Body() dto: JoinWaitlistDto, @Request() req: RequestWithUser) {
    return this.waitlistService.join(dto, req.user!);
  }

  @ApiOperation({ summary: 'Salir de la lista de espera' })
  @Roles('CLIENT', 'ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  leave(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.waitlistService.leave(id, req.user!);
  }

  @ApiOperation({ summary: 'Mis entradas en listas de espera' })
  @Roles('CLIENT')
  @Get('me')
  findMine(@Request() req: RequestWithUser) {
    return this.waitlistService.findMine(req.user!);
  }
}
