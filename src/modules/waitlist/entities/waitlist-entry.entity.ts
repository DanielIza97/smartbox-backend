import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { ClassOrResource } from '../../classes/entities/class-or-resource.entity';

// Lista de espera de clases (Fase 1 del roadmap post-v1.5). Mismo patrón que
// Reservation: una ocurrencia se referencia por (classId, startAt), no hay
// id de ocurrencia materializado. Sin campo de status — a diferencia de
// Reservation, acá no hace falta: la entrada se borra al promoverse o al
// salir de la lista (mismo criterio minimalista que el resto del dominio de
// reservas, ver CLAUDE.md).
@Entity('waitlist_entries')
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => ClassOrResource)
  @JoinColumn({ name: 'class_id' })
  classOrResource!: ClassOrResource;

  @Column({ name: 'class_id' })
  classId!: string;

  @Column({ name: 'start_at', type: 'timestamptz' })
  startAt!: Date;

  // Orden de promoción (FIFO) — el primero en anotarse es el primero en
  // ocupar un cupo liberado.
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
