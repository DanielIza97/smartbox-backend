import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithUser } from '../types/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  // Definimos la jerarquía por si necesitas comparaciones de nivel en el futuro
  private roleHierarchy: Record<string, number> = {
    SUPER_ADMIN: 5,
    ADMIN: 4,
    STAFF: 3,
    USER: 2,
    CLIENT: 1,
    DEVICE: 0,
  };

  canActivate(context: ExecutionContext): boolean {
    // Obtenemos los roles requeridos desde el decorador @Roles()
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay roles definidos en el endpoint, se permite el acceso
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    // Si no hay usuario o no tiene rol, bloqueamos el acceso
    if (!user || !user.role) {
      this.logger.debug('Acceso denegado: no hay usuario o rol en la request');
      return false;
    }

    // Bypass: Si el usuario es SUPER_ADMIN, siempre tiene acceso total
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // Verificamos si el rol del usuario está dentro de los permitidos
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      this.logger.debug(
        `Acceso denegado. Usuario: ${user.role}, Requerido: ${requiredRoles.join(', ')}`,
      );
    }

    return hasRole;
  }
}
