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
  // Pago — la plata de sus socios va directo a esta cuenta, no a la de
  // SmartBox. Ya no es vía OAuth (ver nota en mercadopago.service.ts): el
  // gimnasio pega su propio access token, generado desde su propia cuenta
  // de Mercado Pago, sin que SmartBox tenga que operar una "Aplicación".
  // Token/webhook secret ocultos por default, igual que User.password.
  @Column({ name: 'mercadopago_user_id', type: 'varchar', nullable: true })
  mercadoPagoUserId?: string | null;

  @Column({
    name: 'mercadopago_access_token',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  mercadoPagoAccessToken?: string | null;

  // Sin Aplicación centralizada no hay un secreto de firma único para toda
  // la plataforma — cada gimnasio configura su propio webhook en su propia
  // cuenta de Mercado Pago y recibe su propio secreto, así que se guarda
  // por gimnasio en vez de en una env var global.
  @Column({
    name: 'mercadopago_webhook_secret',
    type: 'varchar',
    nullable: true,
    select: false,
  })
  mercadoPagoWebhookSecret?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
