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

// Sucursal (Fase 1 del roadmap post-v1.5) — ubicación física dentro de un
// mismo Gym/tenant. Gym sigue siendo el negocio con una sola facturación de
// Mercado Pago; Location es la unidad a la que se atan Clases/Turnos/
// Check-ins (decisión de scoping, 2026-07-24). Todo Gym nace con una
// Location "Sucursal Principal" (ver LocationsService.createDefault) para
// que nunca quede una clase/turno/check-in sin dónde apuntar.
@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Gym)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ name: 'gym_id' })
  gymId!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  address?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
