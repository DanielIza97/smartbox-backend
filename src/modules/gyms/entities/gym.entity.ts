import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('gyms')
export class Gym {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ default: 'UTC' })
  timezone!: string;

  // Modelo Marketplace: cada gimnasio conecta su propia cuenta de Mercado
  // Pago vía OAuth (GET /gyms/:id/mercadopago/connect) — la plata de sus
  // socios va directo a esta cuenta, no a la de SmartBox. Token/refresh
  // ocultos por default, igual que User.password.
  @Column({ name: 'mercadopago_user_id', type: 'varchar', nullable: true })
  mercadoPagoUserId?: string | null;

  @Column({
    name: 'mercadopago_access_token',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  mercadoPagoAccessToken?: string | null;

  @Column({
    name: 'mercadopago_refresh_token',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  mercadoPagoRefreshToken?: string | null;

  @Column({
    name: 'mercadopago_token_expires_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
  })
  mercadoPagoTokenExpiresAt?: Date | null;

  // Estado efímero del handshake OAuth — se genera en /connect, se valida
  // y limpia en /callback. TokenService ya resuelve la generación/expiración.
  @Column({
    name: 'mercadopago_oauth_state',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  mercadoPagoOauthState?: string | null;

  @Column({
    name: 'mercadopago_oauth_state_expires_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
  })
  mercadoPagoOauthStateExpiresAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
