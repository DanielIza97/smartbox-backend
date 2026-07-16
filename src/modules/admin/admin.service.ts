import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  // Resumen de sistema para el panel de administración: totales y usuarios por rol.
  async getDashboardSummary() {
    const [users, roles] = await Promise.all([
      this.usersService.findAll(),
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
