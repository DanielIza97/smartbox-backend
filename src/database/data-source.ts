import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from '../modules/users/user.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { Gym } from '../modules/gyms/entities/gym.entity';
import { Plan } from '../modules/plans/entities/plan.entity';
import { Membership } from '../modules/memberships/entities/membership.entity';
import { ProcessedWebhookEvent } from '../modules/memberships/entities/processed-webhook-event.entity';
import { Invoice } from '../modules/memberships/entities/invoice.entity';

// DataSource standalone para el CLI de TypeORM (migration:generate/run/revert).
// No pasa por el ConfigModule de Nest — lee process.env directo (dotenv/config
// arriba carga .env). No se usa como provider de la app en runtime.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  entities: [User, Role, Gym, Plan, Membership, ProcessedWebhookEvent, Invoice],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
