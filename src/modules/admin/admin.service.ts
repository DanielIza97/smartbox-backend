import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  // Resumen para el panel de administración: totales y usuarios por rol.
  // Scopeado al gimnasio del solicitante (ADMIN); SUPER_ADMIN ve todo el sistema.
  async getDashboardSummary(requester: AuthenticatedUser) {
    const [users, roles] = await Promise.all([
      this.usersService.findAll(requester),
      this.rolesService.findAll(),
    ]);

    const usersByRole: Record<string, number> = {};
    for (const user of users) {
      const roleName = user.role?.name ?? 'SIN_ROL';
      usersByRole[roleName] = (usersByRole[roleName] ?? 0) + 1;
    }

    return {
      totalUsers: users.length,
      totalRoles: roles.length,
      usersByRole,
    };
  }
}
