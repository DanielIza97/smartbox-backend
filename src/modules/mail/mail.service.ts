import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailtrapClient } from 'mailtrap';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: MailtrapClient | null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;
  private readonly isSandbox: boolean;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('MAILTRAP_API_KEY');
    this.isSandbox =
      this.configService.get<string>('MAILTRAP_USE_SANDBOX') === 'true';
    const inboxId = this.isSandbox
      ? Number(this.configService.get<string>('MAILTRAP_INBOX_ID'))
      : undefined;

    if (!token) {
      this.logger.warn(
        'MAILTRAP_API_KEY no está definida. El envío de correos estará deshabilitado.',
      );
      this.client = null;
    } else {
      if (this.isSandbox && !inboxId) {
        this.logger.warn(
          'MAILTRAP_INBOX_ID es requerido cuando MAILTRAP_USE_SANDBOX=true.',
        );
      }

      this.client = new MailtrapClient({
        token,
        sandbox: this.isSandbox,
        testInboxId: inboxId,
      });
    }

    this.fromName =
      this.configService.get<string>('MAILTRAP_FROM_NAME') ?? 'Smartbox';
    this.fromEmail =
      this.configService.get<string>('MAILTRAP_FROM_EMAIL') ??
      (this.isSandbox ? 'sandbox@mailtrap.io' : 'noreply@smartbox.com');
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  async sendResetPasswordEmail(email: string, token: string): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `Omitiendo envío de correo a ${email}: MAILTRAP_API_KEY no configurada.`,
      );
      return;
    }

    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
    const subjectPrefix = this.isSandbox ? '[SANDBOX] ' : '';

    await this.client.send({
      from: { name: this.fromName, email: this.fromEmail },
      to: [{ email }],
      subject: `${subjectPrefix}Recuperación de contraseña - Smartbox`,
      text: `Recupera tu contraseña visitando: ${resetUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Recuperación de contraseña</h2>
          <p>Hemos recibido una solicitud para restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace para continuar. Este enlace expira en 1 hora.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px;">
              Restablecer contraseña
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Si no solicitaste este cambio, puedes ignorar este correo.
          </p>
          <p style="color: #6b7280; font-size: 12px; word-break: break-all;">
            Enlace directo: ${resetUrl}
          </p>
        </div>
      `,
    });

    this.logger.log(
      `Correo de recuperación enviado a ${email}${this.isSandbox ? ' (Mailtrap Sandbox)' : ''}`,
    );
  }

  async sendEmailChangeVerification(
    email: string,
    token: string,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `Omitiendo envío de correo a ${email}: Mailtrap no configurado.`,
      );
      return;
    }

    const verifyUrl = `${this.frontendUrl}/confirm-email?token=${token}`;
    const subjectPrefix = this.isSandbox ? '[SANDBOX] ' : '';

    await this.client.send({
      from: { name: this.fromName, email: this.fromEmail },
      to: [{ email }],
      subject: `${subjectPrefix}Verificación de cambio de correo - Smartbox`,
      text: `Para completar el cambio de tu correo, visita: ${verifyUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Confirmar cambio de correo electrónico</h2>
          <p>Has solicitado cambiar tu correo electrónico en Smartbox.</p>
          <p>Para completar el proceso, por favor haz clic en el siguiente botón:</p>
          <p>
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 6px;">
              Confirmar nuevo correo
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Si no has solicitado este cambio, puedes ignorar este mensaje con seguridad.
          </p>
        </div>
      `,
    });

    this.logger.log(`Correo de verificación de cambio enviado a ${email}`);
  }

  // Primer uso de MailService fuera de auth — mismo patrón fail-open que
  // los dos métodos de arriba. Se dispara desde WaitlistService.tryPromote
  // cuando alguien pasa de lista de espera a reserva confirmada.
  async sendWaitlistPromotedEmail(
    email: string,
    className: string,
    startAt: Date,
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `Omitiendo envío de correo a ${email}: Mailtrap no configurado.`,
      );
      return;
    }

    const formattedDate = startAt.toLocaleString('es-EC', {
      dateStyle: 'full',
      timeStyle: 'short',
    });
    const subjectPrefix = this.isSandbox ? '[SANDBOX] ' : '';

    await this.client.send({
      from: { name: this.fromName, email: this.fromEmail },
      to: [{ email }],
      subject: `${subjectPrefix}¡Se liberó un cupo! - Smartbox`,
      text: `Se liberó un cupo en ${className} (${formattedDate}) y quedaste anotado con reserva confirmada.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>¡Se liberó un cupo!</h2>
          <p>Estabas en la lista de espera de <strong>${className}</strong> y se liberó un cupo.</p>
          <p>Ya quedaste anotado con reserva confirmada para el <strong>${formattedDate}</strong>.</p>
        </div>
      `,
    });

    this.logger.log(
      `Correo de promoción de lista de espera enviado a ${email}`,
    );
  }
}
