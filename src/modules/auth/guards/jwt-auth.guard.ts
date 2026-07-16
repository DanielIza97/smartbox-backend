import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../types/auth.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err || !user) {
      this.logger.debug(`JWT inválido o expirado: ${JSON.stringify(info)}`);
      throw err instanceof Error ? err : new UnauthorizedException();
    }
    this.logger.debug('Usuario autenticado correctamente');
    return user;
  }
}
