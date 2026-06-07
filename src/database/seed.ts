import { seedRoles } from './seed-roles';
import { seedAdmin } from './seed-admin';
import { DataSource } from 'typeorm';

export async function seed(dataSource: DataSource) {
  await seedRoles(dataSource);
  await seedAdmin(dataSource);

  console.log('Seed completo ejecutado');
}