import { TokenService } from './token.service';

describe('TokenService', () => {
  const tokenService = new TokenService();

  describe('generate', () => {
    it('genera un token hexadecimal con la expiración esperada', () => {
      const { token, expiresAt } = tokenService.generate(1);

      expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 bytes -> 64 chars hex
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 61 * 60 * 1000,
      );
    });

    it('respeta un largo de token distinto', () => {
      const { token } = tokenService.generate(1, 16);
      expect(token).toMatch(/^[0-9a-f]{32}$/); // 16 bytes -> 32 chars hex
    });

    it('dos tokens generados no se repiten', () => {
      const a = tokenService.generate(1);
      const b = tokenService.generate(1);
      expect(a.token).not.toBe(b.token);
    });
  });

  describe('isExpired', () => {
    it('es true si la fecha es null', () => {
      expect(tokenService.isExpired(null)).toBe(true);
    });

    it('es true si la fecha ya pasó', () => {
      const past = new Date(Date.now() - 1000);
      expect(tokenService.isExpired(past)).toBe(true);
    });

    it('es false si la fecha está en el futuro', () => {
      const future = new Date(Date.now() + 60_000);
      expect(tokenService.isExpired(future)).toBe(false);
    });
  });
});
