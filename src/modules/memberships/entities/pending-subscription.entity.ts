import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Plan } from '../../plans/entities/plan.entity';

// Correlaciona un PreApproval de Mercado Pago con el Plan elegido en
// MembershipsService.subscribe() — necesario desde E6-04 (varios Plan por
// gimnasio): antes alcanzaba con resolver "el" Plan del gimnasio del socio
// vía external_reference → User.gym, pero con múltiples planes esa
// resolución es ambigua. El recurso PreApproval que devuelve el SDK de
// Mercado Pago (`PreApprovalResponse`) no trae `preapproval_plan_id` de
// vuelta (sí está en el request de creación, no en el GET que usa el
// webhook — confirmado contra los tipos del SDK), así que no hay forma de
// leerlo de ahí; se guarda acá en el momento de crear la suscripción.
@Entity('pending_subscriptions')
export class PendingSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mercadopago_preapproval_id', unique: true })
  mercadoPagoPreapprovalId!: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ name: 'plan_id' })
  planId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
