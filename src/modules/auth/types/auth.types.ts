import type { Request } from 'express';

// Forma del payload firmado dentro del JWT.
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  // null para SUPER_ADMIN (no pertenece a ningún gimnasio en particular);
  // ausente en tokens firmados antes de Epic 1.
  gymId?: string | null;
}

// Forma que queda en `request.user` una vez que JwtStrategy.validate() corre.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  gymId?: string | null;
}

export interface RequestWithUser extends Request {
  // Opcional: solo está garantizado si JwtAuthGuard corrió antes en la cadena de guards.
  user?: AuthenticatedUser;
}
