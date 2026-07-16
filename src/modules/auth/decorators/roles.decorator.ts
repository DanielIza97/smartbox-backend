import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator para asignar roles requeridos a un endpoint o controlador.
 * Ejemplo: @Roles('ADMIN', 'STAFF')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
