import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite el acceso si el endpoint no declara @Roles()', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ role: 'CLIENT' }))).toBe(true);
  });

  it('deniega el acceso si no hay usuario en la request (sin JwtAuthGuard antes)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(makeContext(undefined))).toBe(false);
  });

  it('deniega el acceso si el rol del usuario no está permitido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(guard.canActivate(makeContext({ role: 'CLIENT' }))).toBe(false);
  });

  it('permite el acceso si el rol del usuario está en la lista requerida', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['ADMIN', 'STAFF']);
    expect(guard.canActivate(makeContext({ role: 'STAFF' }))).toBe(true);
  });

  it('SUPER_ADMIN siempre pasa, aunque no esté en la lista requerida', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['STAFF']);
    expect(guard.canActivate(makeContext({ role: 'SUPER_ADMIN' }))).toBe(true);
  });
});
