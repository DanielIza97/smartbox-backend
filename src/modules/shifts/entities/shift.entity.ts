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

// Horario de trabajo recurrente de un STAFF (E4-02) — desacoplado de
// ClassOrResource a propósito (decisión de scoping, 2026-07-17): responde
// "qué días/horas trabaja cada empleado", no "quién dicta esta clase". El
// gymId se hereda transitivamente vía staff.gymId, igual que Membership vía
// plan.gymId.
@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'staff_id' })
  staff!: User;

  @Column({ name: 'staff_id' })
  staffId!: string;

  // 0 = domingo ... 6 = sábado (Date.getDay()).
  @Column({ name: 'day_of_week' })
  dayOfWeek!: number;

  // 'HH:mm', hora del servidor — mismo criterio que ClassOrResource.
  @Column({ name: 'start_time' })
  startTime!: string;

  @Column({ name: 'end_time' })
  endTime!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
