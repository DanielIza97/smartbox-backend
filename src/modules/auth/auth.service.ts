import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../roles/entities/role.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../../common/token/token.service';
import { RegisterDto } from './dto/register.dto';
import { SignupGymDto } from './dto/signup-gym.dto';
import { LocationsService } from '../locations/locations.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
    private readonly locationsService: LocationsService,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
  ) {}

  // 1. LOGIN
  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Tu correo o contraseña no son correctos.',
        error: 'Unauthorized',
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException({
        message: 'Tu correo o contraseña no son correctos.',
        error: 'Unauthorized',
      });
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role?.name,
      gymId: user.gym?.id ?? null,
    };

    const token = await this.jwtService.signAsync(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role?.name,
        gymId: user.gym?.id ?? null,
      },
    };
  }

  // 1b. LISTADO PÚBLICO DE GIMNASIOS — para que /register (alta pública de
  // CLIENT) pueda ofrecer un selector de a qué gimnasio unirse, sin
  // necesitar GET /gyms (SUPER_ADMIN-only). Solo id/name, nada sensible ni
  // operativo (nada de Mercado Pago, dirección, etc.).
  async listGymsForSignup() {
    return this.gymRepository.find({
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

  // 2. REGISTRO
  async register(registerDto: Omit<RegisterDto, 'roleName'>) {
    const { email, password, name, gymId } = registerDto;

    if (!gymId) {
      throw new BadRequestException(
        'gymId es obligatorio para registrarse: elegí el gimnasio al que te unís.',
      );
    }

    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    const defaultRole = await this.roleRepository.findOne({
      where: { name: 'CLIENT' },
    });
    if (!defaultRole) {
      throw new NotFoundException(
        "El rol por defecto 'CLIENT' no existe en el sistema.",
      );
    }

    const newUser = await this.usersService.create({
      name,
      email,
      password,
      roleId: defaultRole.id,
      gymId,
    });

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

  // 2b. ONBOARDING SELF-SERVE DE GIMNASIOS (E6-05, Epic 6 · v1.5) — un
  // dueño de gimnasio prospecto da de alta su propio gimnasio y su cuenta
  // ADMIN en un solo paso público, sin pasar por SUPER_ADMIN. Devuelve el
  // mismo shape que login() (auto-login, evita un paso extra justo después
  // de crear un tenant nuevo). Sin transacción explícita: si la creación
  // de la Location default o del User falla después de crear el Gym, queda
  // un Gym huérfano sin sucursal/dueño — mismo criterio no-transaccional
  // que el resto del código (p. ej. PlansService.create() tampoco revierte
  // nada si el save local falla después de un alta exitosa en Mercado
  // Pago); no hay uso de transacciones en ningún otro lado de este repo
  // todavía. Crea también una Location "Sucursal Principal" (Fase 1
  // post-v1.5, mismo criterio que GymsService.create()) para que el gym
  // nuevo nunca quede sin dónde atar Clases/Turnos/Check-ins.
  async signupGym(dto: SignupGymDto) {
    const { gymName, address, timezone, ownerName, email, password } = dto;

    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    const adminRole = await this.roleRepository.findOne({
      where: { name: 'ADMIN' },
    });
    if (!adminRole) {
      throw new NotFoundException("El rol 'ADMIN' no existe en el sistema.");
    }

    const gym = this.gymRepository.create({ name: gymName, address, timezone });
    const savedGym = await this.gymRepository.save(gym);
    await this.locationsService.createDefault(savedGym.id, savedGym.address);

    const newUser = await this.usersService.create({
      name: ownerName,
      email,
      password,
      roleId: adminRole.id,
      gymId: savedGym.id,
    });

    const payload = {
      sub: newUser.id,
      email: newUser.email,
      role: adminRole.name,
      gymId: savedGym.id,
    };
    const token = await this.jwtService.signAsync(payload);

    return {
      access_token: token,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: adminRole.name,
        gymId: savedGym.id,
      },
    };
  }

  // 3. REGISTRO INTERNO
  async registerInternal(registerDto: RegisterDto) {
    const { email, password, name, roleName, gymId } = registerDto;

    if (!roleName) {
      throw new BadRequestException(
        'El nombre del rol es obligatorio para registros internos.',
      );
    }

    const userExists = await this.usersService.findByEmail(email);
    if (userExists) {
      throw new BadRequestException(
        'El correo electrónico ya está registrado.',
      );
    }

    const role = await this.roleRepository.findOne({
      where: { name: roleName },
    });
    if (!role) {
      throw new NotFoundException(
        `El rol '${roleName}' no existe en el sistema.`,
      );
    }

    if (role.name !== 'SUPER_ADMIN' && !gymId) {
      throw new BadRequestException(
        `gymId es obligatorio para el rol ${role.name}.`,
      );
    }

    const newUser = await this.usersService.create({
      name,
      email,
      password,
      roleId: role.id,
      gymId: role.name === 'SUPER_ADMIN' ? undefined : gymId,
    });

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

  // 4. SOLICITAR RECUPERACIÓN
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new NotFoundException(
        'No existe ningún usuario con ese correo electrónico.',
      );
    }

    const { token, expiresAt } = this.tokenService.generate(1, 16);

    await this.usersService.updateResetToken(user.id, token, expiresAt);

    void this.mailService
      .sendResetPasswordEmail(email, token)
      .catch((error) => {
        this.logger.error(
          `No se pudo enviar el correo de recuperación a ${email}`,
          error,
        );
      });

    return { message: 'Se ha generado el enlace de recuperación con éxito.' };
  }

  // 5. RESTABLECER CONTRASEÑA
  async resetPassword(token: string, newPassword: string) {
    const user = await this.usersService.findByResetToken(token);

    if (!user) {
      throw new BadRequestException(
        'El enlace de recuperación es inválido o ya fue utilizado.',
      );
    }

    if (this.tokenService.isExpired(user.resetPasswordExpires)) {
      throw new BadRequestException('El enlace de recuperación ha expirado.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.usersService.updatePasswordAndClearToken(
      user.id,
      hashedPassword,
    );

    return { message: 'Tu contraseña ha sido actualizada con éxito.' };
  }
}
