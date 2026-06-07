import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from '../modules/users/user.entity';
import { Role } from '../modules/roles/entities/role.entity';

export async function seedAdmin(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);
  const roleRepo = dataSource.getRepository(Role);

  const exists = await userRepo.findOne({
    where: { email: 'admin@smartbox.com' },
  });

  if (exists) return;

  const role = await roleRepo.findOne({
    where: { name: 'SUPER_ADMIN' },
  });

  if (!role) throw new Error('SUPER_ADMIN role not found');

  const password = await bcrypt.hash('admin123', 10);

  await userRepo.save({
    name: 'Admin',
    email: 'admin@smartbox.com',
    password,
    role,
  });

  console.log('Admin creado correctamente');
}