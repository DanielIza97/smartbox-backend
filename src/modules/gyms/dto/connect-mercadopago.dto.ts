import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectMercadoPagoDto {
  @ApiProperty({
    description:
      'Access token generado desde la propia cuenta de Mercado Pago del gimnasio (Tu negocio → Configuración → Credenciales).',
  })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({
    description:
      'Secreto de firma del webhook configurado por el gimnasio en su propia cuenta de Mercado Pago (Notificaciones).',
  })
  @IsString()
  @IsNotEmpty()
  webhookSecret!: string;
}
