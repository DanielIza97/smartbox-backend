import type { Request } from 'express';

// Forma del payload firmado dentro del JWT.
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

// Forma que queda en `request.user` una vez que JwtStrategy.validate() corre.
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

export interface RequestWithUser extends Request {
  // Opcional: solo está garantizado si JwtAuthGuard corrió antes en la cadena de guards.
  user?: AuthenticatedUser;
}
