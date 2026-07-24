import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Gym } from '../../gyms/entities/gym.entity';
import { Reservation } from '../../reservations/entities/reservation.entity';

// Check-in físico (Fase 1 del roadmap post-v1.5) — evento separado de la
// Reservation a propósito: el comentario de Reservation ya documentaba que
// el modelo de 3 estados (confirmed/cancelled/expired) se simplificó dejando
// el check-in físico para más adelante. Meterlo como un 4º estado mezclaría
// "la reserva es válida" con "la persona efectivamente vino" — quedan
// separados. gymId va denormalizado acá (a diferencia de Reservation, que lo
// hereda vía classOrResource) porque un check-in puede no tener ninguna
// clase asociada (gimnasio libre).
@Entity('check_ins')
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Gym)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ name: 'gym_id' })
  gymId!: string;

  @ManyToOne(() => Reservation, { nullable: true })
  @JoinColumn({ name: 'reservation_id' })
  reservation?: Reservation | null;

  @Column({ name: 'reservation_id', nullable: true })
  reservationId?: string | null;

  // timestamptz explícito, no @CreateDateColumn — es el dato de negocio de
  // la entidad (cuándo llegó), no una columna de auditoría genérica, mismo
  // criterio que Reservation.startAt/endAt.
  @Column({ name: 'checked_in_at', type: 'timestamptz' })
  checkedInAt!: Date;

  @Column({ name: 'checked_out_at', type: 'timestamptz', nullable: true })
  checkedOutAt?: Date | null;
}
