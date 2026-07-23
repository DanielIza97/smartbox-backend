import { Injectable } from '@nestjs/common';
import {
  MercadoPagoConfig,
  Payment,
  PreApproval,
  PreApprovalPlan,
  User,
} from 'mercadopago';

export interface GymMercadoPagoClient {
  plans: PreApprovalPlan;
  subscriptions: PreApproval;
  payments: Payment;
}

// Modelo Marketplace: SmartBox no cobra las membresías, cada gimnasio lo
// hace en su propia cuenta de Mercado Pago. Antes esto se conectaba vía
// OAuth con una Aplicación de SmartBox — se abandonó porque crear una
// Aplicación en Mercado Pago exige tener una empresa registrada en
// Argentina, y Ecuador no está soportado para ese producto específico
// (sí lo está para cuentas de vendedor comunes). Ahora cada gimnasio
// genera su propio access token desde su propia cuenta (sin Aplicación
// de por medio) y lo pega en SmartBox — ver GymsService.connectMercadoPago.
@Injectable()
export class MercadoPagoService {
  // Valida un access token pegado a mano contra GET /users/me — si el
  // token es inválido/revocado, el SDK rechaza la promesa y el caller
  // (GymsService) lo traduce a un error explícito para el usuario.
  async verifyAccessToken(
    accessToken: string,
  ): Promise<{ userId: string; email?: string }> {
    const config = new MercadoPagoConfig({ accessToken });
    const user = await new User(config).get();
    return { userId: String(user.id), email: user.email };
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
