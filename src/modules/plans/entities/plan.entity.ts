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

// Un solo plan mensual por gimnasio para v1.0 (Recomendación 3 / sesión de
// scoping de billing) — de ahí el unique en gym_id. Múltiples planes por
// gimnasio queda diferido a E6-04 (v1.5).
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Gym)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ name: 'gym_id', unique: true })
  gymId!: string;

  @Column()
  name!: string;

  @Column({ name: 'price_cents' })
  priceCents!: number;

  // Se completa en E2-02 al crear el Product/Price en Stripe.
  @Column({ name: 'stripe_price_id', type: 'varchar', nullable: true })
  stripePriceId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
