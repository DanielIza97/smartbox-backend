import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Gym } from '../../gyms/entities/gym.entity';

// Múltiples planes por gimnasio (niveles/tiers) desde E6-04 — antes de eso,
// v1.0 tenía un unique en gym_id (Recomendación 3 / sesión de scoping de
// billing) que restringía a un solo plan mensual. Sin descuentos ni cupones
// todavía — eso es alcance explícitamente diferido dentro de E6-04.
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Gym)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ name: 'gym_id' })
  gymId!: string;

  @Column()
  name!: string;

  @Column({ name: 'price_cents' })
  priceCents!: number;

  // Se completa en E2-02 al crear el PreApprovalPlan en Mercado Pago.
  @Column({ name: 'mercadopago_plan_id', type: 'varchar', nullable: true })
  mercadoPagoPlanId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
