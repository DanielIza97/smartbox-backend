import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Role } from '../roles/entities/role.entity';
import { Gym } from '../gyms/entities/gym.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ select: false })
  password!: string;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  // Nulo solo para SUPER_ADMIN — el resto de los roles pertenece a un gimnasio.
  @ManyToOne(() => Gym, { nullable: true })
  @JoinColumn({ name: 'gym_id' })
  gym!: Gym | null;

  @Column({ default: 'active' })
  status!: string;

  @Column({
    name: 'reset_password_token',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  resetPasswordToken!: string | null;

  @Column({
    name: 'reset_password_expires',
    type: 'timestamp',
    nullable: true,
    select: false,
  })
  resetPasswordExpires!: Date | null;

  @Column({
    name: 'pending_email',
    type: 'varchar',
    nullable: true,
  })
  pendingEmail!: string | null;

  @Column({
    name: 'email_change_token',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  emailChangeToken!: string | null;

  @Column({
    name: 'email_change_token_expires',
    type: 'timestamp',
    nullable: true,
    select: false,
  })
  emailChangeTokenExpires!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
