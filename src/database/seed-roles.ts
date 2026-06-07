import { DataSource } from 'typeorm';
import { Role } from '../modules/roles/entities/role.entity';

export async function seedRoles(dataSource: DataSource) {
  const roleRepo = dataSource.getRepository(Role);

  const roles = [
    { name: 'SUPER_ADMIN', description: 'Control total del sistema' },
    { name: 'ADMIN', description: 'Administrador de local' },
    { name: 'STAFF', description: 'Soporte y mantenimiento' },
    { name: 'CLIENT', description: 'Usuario final del sistema' },
    { name: 'DEVICE', description: 'Dispositivo IoT ESP32' },
  ];

  const existingRoles = await roleRepo.find();

  const existingNames = new Set(existingRoles.map(r => r.name));

  const toInsert = roles.filter(r => !existingNames.has(r.name));

  if (toInsert.length > 0) {
    await roleRepo.save(toInsert);
    console.log(`Roles insertados: ${toInsert.length}`);
  }
}