import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // 1. LOGIN
  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role?.name,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role?.name,
      },
    };
  }

  // 2. REGISTRO
  async register(signUpData: any) {
    const { email, password, name, roleId } = signUpData;

    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException('El correo electrónico ya está registrado.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await this.usersService.create({
      email,
      name,
      password: hashedPassword,
      roleId,
    });

    return newUser;
  }

  // 3. SOLICITAR RECUPERACIÓN
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new NotFoundException('No existe ningún usuario con ese correo electrónico.');
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expires = new Date();
    expires.setHours(expires.getHours() + 1);

    await this.usersService.updateResetToken(user.id, token, expires);

    const resetUrl = `http://localhost:3000/reset-password?token=${token}`;
    console.log(`\n📩 [SMARTBOX MAIL] Enlace enviado a ${email}: \n${resetUrl}\n`);

    return { message: 'Se ha generado el enlace de recuperación con éxito.' };
  }

  // 4. RESTABLECER CONTRASEÑA
  async resetPassword(token: string, passwordBody: any) {
    const user = await this.usersService.findByResetToken(token);
    
    if (!user) {
      throw new BadRequestException('El token de recuperación es inválido o ya fue utilizado.');
    }

    if (new Date() > user.resetPasswordExpires!) {
      throw new BadRequestException('El token de recuperación ha expirado.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordBody, salt);

    await this.usersService.updatePasswordAndClearToken(user.id, hashedPassword);

    return { message: 'Tu contraseña ha sido actualizada con éxito.' };
  }

  async validateUser(userId: string) {
    return this.usersService.findOne(userId);
  }
}