import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm'; 
import { Repository } from 'typeorm';                 
import { Role } from '../roles/entities/role.entity'; 
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {}

  // 1. LOGIN
  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Tu correo o contraseña no son correctos.',
        error: 'Unauthorized'
      });    
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException({
              message: 'Tu correo o contraseña no son correctos.',
              error: 'Unauthorized'
            });   
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
  async register(registerDto: Omit<RegisterDto, 'roleName'>) {
    const { email, password, name } = registerDto;

    // 1. Validar si el usuario ya existe por email
    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException('El correo electrónico ya está registrado.');
    }

    // 2. Encriptar la contraseña de forma segura
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. ASIGNACIÓN AUTOMÁTICA DEL ROL BÁSICO
    const DEFAULT_ROLE_UUID = 'bd6d3919-3ed1-4daf-9308-7c564d2d14f5';

    // 4. Crear el usuario en la base de datos vinculando el rol por defecto
    const newUser = await this.usersService.create({
      name,
      email,
      password: hashedPassword,
      roleId: DEFAULT_ROLE_UUID,
    });

    // 5. Retornar una respuesta limpia
    return {
      statusCode: 201,
      message: 'Usuario registrado exitosamente',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        status: newUser.status,
      },
    };
  }
  
  // 2. REGISTRO INTERNO (Para el SuperAdmin desde el Dashboard)
  async registerInternal(registerDto: RegisterDto) {
    const { email, password, name, roleName } = registerDto;

    if (!roleName) {
      throw new BadRequestException('El nombre del rol es obligatorio para registros internos.');
    }

    // 1. Validar si el usuario ya existe por email
    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException('El correo electrónico ya está registrado.');
    }

    // 2. BUSCAR EL ROL EN LA BASE DE DATOS POR SU NOMBRE STRING
    const role = await this.roleRepository.findOne({ where: { name: roleName } });
    if (!role) {
      throw new NotFoundException(`El rol '${roleName}' no existe en el sistema.`);
    }

    // 3. Encriptar la contraseña de forma segura
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Crear el usuario vinculando el UUID dinámico obtenido de la consulta anterior
    const newUser = await this.usersService.create({
      name,
      email,
      password: hashedPassword,
      roleId: role.id,
    });

    // 5. Retornar respuesta
    return {
      statusCode: 201,
      message: 'Usuario administrativo creado exitosamente',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        status: newUser.status,
      },
    };
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

    void this.mailService
      .sendResetPasswordEmail(email, token)
      .catch((error) => {
        this.logger.error(
          `No se pudo enviar el correo de recuperación a ${email}`,
          error instanceof Error ? error.stack : String(error),
        );
      });

    return { message: 'Se ha generado el enlace de recuperación con éxito.' };
  }

  // 4. RESTABLECER CONTRASEÑA
  async resetPassword(token: string, passwordBody: any) {
    const user = await this.usersService.findByResetToken(token);
    
    if (!user) {
      throw new BadRequestException('El enlace de recuperación es inválido o ya fue utilizado.');
    }

    if (new Date() > user.resetPasswordExpires!) {
      throw new BadRequestException('El enlace de recuperación ha expirado.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordBody, salt);

    await this.usersService.updatePasswordAndClearToken(user.id, hashedPassword);

    return { message: 'Tu contraseña ha sido actualizada con éxito.' };
  }
}