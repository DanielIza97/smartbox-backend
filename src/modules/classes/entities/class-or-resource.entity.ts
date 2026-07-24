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
import { Location } from '../../locations/entities/location.entity';

// Plantilla recurrente semanal (Epic 3 · E3-01) — una fila = un turno que se
// repite todas las semanas el mismo día/hora (p. ej. "Yoga" lunes 09:00, 60
// min). Una clase que se dicta varios días por semana se modela con varias
// filas (mismo name, distinto dayOfWeek). Las ocurrencias reservables se
// derivan de este patrón en el momento (ver occurrence.util.ts), no se
// materializan en una tabla aparte.
@Entity('classes')
export class ClassOrResource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Gym)
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym;

  @Column({ name: 'gym_id' })
  gymId!: string;

  // Sucursal donde se dicta (Fase 1 post-v1.5) — requerida, todo Gym nace
  // con al menos una Location, ver LocationsService.createDefault.
  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @Column({ name: 'location_id' })
  locationId!: string;

  @Column()
  name!: string;

  @Column()
  capacity!: number;

  // 0 = domingo ... 6 = sábado (Date.getDay()).
  @Column({ name: 'day_of_week' })
  dayOfWeek!: number;

  // 'HH:mm', hora del servidor — sin soporte de timezone por gimnasio
  // todavía (Gym.timezone existe pero no se usa acá, igual que en el resto
  // del dominio de billing).
  @Column({ name: 'start_time' })
  startTime!: string;

  @Column({ name: 'duration_minutes' })
  durationMinutes!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
