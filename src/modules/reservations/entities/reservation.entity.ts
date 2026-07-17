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
import { ClassOrResource } from '../../classes/entities/class-or-resource.entity';

// Modelo de estados simplificado para Epic 3 (v1.0) — sin pending/active/
// finished, que en el documento original estaban pensados para el check-in
// físico de Epic 8 (SmartBox IoT), todavía sin diseñar. Una reserva nace
// 'confirmed'; pasa a 'cancelled' si el socio/ADMIN la cancela, o a
// 'expired' vía cron cuando su horario ya pasó sin cancelarse (E3-04).
export type ReservationStatus = 'confirmed' | 'cancelled' | 'expired';

@Entity('reservations')
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' })
  userId!: string;

  // gymId se hereda transitivamente vía classOrResource.gymId, igual que
  // Membership hereda el suyo vía plan.gymId.
  @ManyToOne(() => ClassOrResource)
  @JoinColumn({ name: 'class_id' })
  classOrResource!: ClassOrResource;

  @Column({ name: 'class_id' })
  classId!: string;

  @Column({ name: 'start_at', type: 'timestamp' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'timestamp' })
  endAt!: Date;

  @Column({ type: 'varchar' })
  status!: ReservationStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
