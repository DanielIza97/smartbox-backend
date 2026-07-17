import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Membership } from './membership.entity';

// Registro interno de facturación (E2-06) — se puebla únicamente desde los
// eventos de pago recurrente del webhook (subscription_authorized_payment,
// E2-05), nunca con alta manual. Es la fuente de datos para reportes de
// Epic 4; en v1.0 no tiene UI de historial propia ni endpoint dedicado, y
// no maneja reembolsos (eso se resuelve a mano desde el panel de Mercado
// Pago, sesión de scoping de billing). El gymId se hereda transitivamente
// vía membership.plan.gymId, igual que en Membership.
//
// `status` refleja el status crudo del recurso Payment de Mercado Pago
// (`approved`, `rejected`, y potencialmente otros como `refunded` o
// `cancelled` si el proveedor los notifica) — no se restringe a un union
// acá porque esta entidad es un registro pasivo, no la fuente de la
// transición de estado de la Membership (eso lo decide MembershipsService).
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Membership)
  @JoinColumn({ name: 'membership_id' })
  membership!: Membership;

  @Column({ name: 'membership_id' })
  membershipId!: string;

  @Column({ name: 'amount_cents' })
  amountCents!: number;

  @Column({ type: 'varchar' })
  status!: string;

  // Único: un pago de Mercado Pago solo genera una fila de factura, aunque
  // llegue más de una notificación de webhook para el mismo Payment
  // (creado y luego actualizado) — se hace upsert por este campo.
  @Column({ name: 'mercadopago_payment_id', unique: true })
  mercadoPagoPaymentId!: string;

  // timestamptz, no timestamp — un timestamp naive se malinterpreta al
  // leerlo de vuelta si el proceso de Node corre en una timezone distinta
  // a la del server de Postgres (ver CLAUDE.md).
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
