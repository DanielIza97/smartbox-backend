import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MercadoPagoConfig,
  OAuth,
  Payment,
  PreApproval,
  PreApprovalPlan,
} from 'mercadopago';

export interface GymMercadoPagoClient {
  plans: PreApprovalPlan;
  subscriptions: PreApproval;
  payments: Payment;
}

// Modelo Marketplace: SmartBox no cobra las membresías, cada gimnasio lo
// hace en su propia cuenta de Mercado Pago (conectada vía OAuth). Este
// servicio expone dos cosas distintas:
//  1. El handshake OAuth (authorization URL, canje de code por tokens),
//     que corre con las credenciales de la APP de SmartBox.
//  2. Un factory (`clientFor`) para construir, por request, un cliente de
//     Mercado Pago con el access_token propio de un gimnasio específico —
//     Plans/Memberships nunca comparten un cliente entre gimnasios.
@Injectable()
export class MercadoPagoService {
  readonly oauth: OAuth;

  constructor(private readonly configService: ConfigService) {
    const platformConfig = new MercadoPagoConfig({
      accessToken: configService.getOrThrow<string>('MERCADOPAGO_ACCESS_TOKEN'),
    });
    this.oauth = new OAuth(platformConfig);
  }

  getAuthorizationUrl(state: string): string {
    return this.oauth.getAuthorizationURL({
      options: {
        client_id: this.configService.getOrThrow<string>(
          'MERCADOPAGO_CLIENT_ID',
        ),
        redirect_uri: this.configService.getOrThrow<string>(
          'MERCADOPAGO_REDIRECT_URI',
        ),
        state,
      },
    });
  }

  async exchangeCodeForTokens(code: string) {
    return await this.oauth.create({
      body: {
        client_id: this.configService.getOrThrow<string>(
          'MERCADOPAGO_CLIENT_ID',
        ),
        client_secret: this.configService.getOrThrow<string>(
          'MERCADOPAGO_CLIENT_SECRET',
        ),
        code,
        redirect_uri: this.configService.getOrThrow<string>(
          'MERCADOPAGO_REDIRECT_URI',
        ),
      },
    });
  }

  clientFor(gymAccessToken: string): GymMercadoPagoClient {
    const config = new MercadoPagoConfig({ accessToken: gymAccessToken });
    return {
      plans: new PreApprovalPlan(config),
      subscriptions: new PreApproval(config),
      payments: new Payment(config),
    };
  }
}
