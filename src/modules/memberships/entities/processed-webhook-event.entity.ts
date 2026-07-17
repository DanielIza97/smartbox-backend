import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

// Idempotencia de webhooks de Mercado Pago: el id de la notificación es la
// PK — insertar de nuevo el mismo id viola la UNIQUE constraint, que es lo
// que usamos para detectar reintentos sin una lectura previa (evita la
// carrera de "leer, no existe, insertar" entre notificaciones concurrentes).
@Entity('processed_webhook_events')
export class ProcessedWebhookEvent {
  @PrimaryColumn()
  id!: string;

  @Column()
  type!: string;

  @CreateDateColumn({ name: 'processed_at' })
  processedAt!: Date;
}
