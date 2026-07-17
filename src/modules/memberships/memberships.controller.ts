import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import type { MercadoPagoWebhookPayload } from './memberships.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @ApiOperation({
    summary:
      'Iniciar la suscripción al plan del propio gimnasio (Mercado Pago, trial 14 días)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @HttpCode(HttpStatus.OK)
  @Post('subscribe')
  subscribe(@Request() req: RequestWithUser) {
    return this.membershipsService.subscribe(req.user!);
  }

  @ApiOperation({
    summary: 'Ver el estado de mi propia membresía (E2-07)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @Get('me')
  findMyMembership(@Request() req: RequestWithUser) {
    return this.membershipsService.findMyMembership(req.user!);
  }

  @ApiOperation({
    summary: 'Ver mi propio historial de facturas (E2-07)',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT')
  @Get('me/invoices')
  findMyInvoices(@Request() req: RequestWithUser) {
    return this.membershipsService.findMyInvoices(req.user!);
  }

  @ApiOperation({
    summary:
      'Cancelar una membresía — conserva acceso hasta el fin del período ya pagado',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CLIENT', 'ADMIN', 'SUPER_ADMIN')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.membershipsService.requestCancellation(id, req.user!);
  }

  // Pública — sin JWT, la seguridad depende de la verificación de firma
  // (x-signature/x-request-id) contra MERCADOPAGO_WEBHOOK_SECRET.
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/mercadopago')
  async webhook(
    @Body() payload: MercadoPagoWebhookPayload,
    @Query('data.id') dataId: string | undefined,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ) {
    await this.membershipsService.handleWebhook(
      { ...payload, data: { id: dataId ?? payload.data?.id } },
      { xSignature, xRequestId },
    );
    return { received: true };
  }
}
