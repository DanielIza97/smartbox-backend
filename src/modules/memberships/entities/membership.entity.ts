import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Plan } from '../../plans/entities/plan.entity';

// Estados según la sesión de scoping de billing: sin 'pending' — el trial de
// 14 días da acceso inmediato, así que la membresía nace 'active'. El
// gymId se hereda transitivamente vía plan.gymId (no se duplica acá).
export type MembershipStatus = 'active' | 'past_due' | 'cancelled';

@Entity('memberships')
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Plan)
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ name: 'plan_id' })
  planId!: string;

  @Column({ type: 'varchar' })
  status!: MembershipStatus;

  // Se completan en E2-02/E2-03 al integrar Stripe Billing y sus webhooks.
  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId?: string | null;

  @Column({ name: 'trial_ends_at', type: 'timestamp', nullable: true })
  trialEndsAt?: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamp', nullable: true })
  currentPeriodEnd?: Date | null;

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
