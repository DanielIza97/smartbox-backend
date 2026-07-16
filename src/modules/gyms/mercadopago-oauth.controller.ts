import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { GymsService } from './gyms.service';

// Callback público al que Mercado Pago redirige el navegador del dueño del
// gimnasio después de autorizar la conexión — no lleva JWT, la seguridad
// depende del `state` de un solo uso generado en GET /gyms/:id/mercadopago/connect.
// Excluido de Swagger: no es un endpoint que se llame a mano, es un redirect.
@ApiExcludeController()
@Controller('mercadopago/oauth')
export class MercadoPagoOauthController {
  private readonly logger = new Logger(MercadoPagoOauthController.name);

  constructor(
    private readonly gymsService: GymsService,
    private readonly configService: ConfigService,
  ) {}

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    try {
      await this.gymsService.completeMercadoPagoConnect(code, state);
      res.redirect(`${frontendUrl}/dashboard/settings?mercadopago=connected`);
    } catch (error) {
      this.logger.error('Falló la conexión OAuth con Mercado Pago', error);
      res.redirect(`${frontendUrl}/dashboard/settings?mercadopago=error`);
    }
  }
}
