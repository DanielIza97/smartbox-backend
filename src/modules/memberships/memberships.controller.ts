import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @ApiOperation({
    summary:
      'Iniciar la suscripción al plan del propio gimnasio (Mercado Pago, trial 14 días)',
  })
  @Roles('CLIENT')
  @HttpCode(HttpStatus.OK)
  @Post('subscribe')
  subscribe(@Request() req: RequestWithUser) {
    return this.membershipsService.subscribe(req.user!);
  }
}
