import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';

export interface GeneratedToken {
  token: string;
  expiresAt: Date;
}

// Fuente única para generar y verificar tokens de un solo uso
// (reset de contraseña, verificación de cambio de email, etc.).
@Injectable()
export class TokenService {
  generate(ttlHours: number, byteLength = 32): GeneratedToken {
    const token = crypto.randomBytes(byteLength).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    return { token, expiresAt };
  }

  isExpired(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true;
    }
    return new Date() > expiresAt;
  }
}
