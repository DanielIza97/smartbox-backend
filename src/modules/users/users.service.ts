import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../../common/token/token.service';
import { Role } from '../roles/entities/role.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {}

  // 1. Crear un usuario vinculando su Rol y su Gimnasio. Única fuente de
  // hasheo de contraseñas para altas de usuario — AuthService.register()/
  // signupGym()/registerInternal() pasan la contraseña en texto plano acá,
  // nunca la hashean ellos mismos (antes sí lo hacían, duplicado; este
  // método nunca hasheaba, así que POST /users almacenaba la contraseña
  // en texto plano si alguien lo llamaba directamente — corregido acá).
  async create(createUserDto: CreateUserDto): Promise<User> {
    const { roleId, gymId, password, ...userData } = createUserDto;

    const role = await this.roleRepository.findOne({
      where: { id: roleId },
    });
    if (!role) {
      throw new BadRequestException('El rol especificado no es válido.');
    }

    if (role.name === 'SUPER_ADMIN') {
      if (gymId) {
        throw new BadRequestException(
          'Un SUPER_ADMIN no pertenece a ningún gimnasio.',
        );
      }
    } else if (!gymId) {
      throw new BadRequestException(
        `gymId es obligatorio para el rol ${role.name}.`,
      );
    }

    if (gymId) {
      const gym = await this.gymRepository.findOne({ where: { id: gymId } });
      if (!gym) {
        throw new NotFoundException('El gimnasio especificado no existe.');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = this.userRepository.create({
      ...userData,
      password: hashedPassword,
      role: { id: roleId },
      gym: gymId ? { id: gymId } : null,
      status: 'active',
    });

    try {
      return await this.userRepository.save(newUser);
    } catch {
      throw new BadRequestException(
        'No se pudo crear el usuario. Verifica los datos ingresados.',
      );
    }
  }

  // 2. Listar usuarios — SUPER_ADMIN ve todos, el resto solo su propio gimnasio
  async findAll(requester: AuthenticatedUser): Promise<User[]> {
    if (requester.role === 'SUPER_ADMIN') {
      return await this.userRepository.find({
        relations: { role: true, gym: true },
      });
    }

    return await this.userRepository.find({
      where: { gym: { id: requester.gymId ?? '' } },
      relations: { role: true, gym: true },
    });
  }

  // 3. Buscar un usuario por su Email
  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.gym', 'gym')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // 4. Buscar un único usuario por su ID, sin chequeo de pertenencia (uso interno)
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { role: true, gym: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    return user;
  }

  // 4b. Buscar un usuario por ID validando que el solicitante tenga acceso
  // (mismo gimnasio, o SUPER_ADMIN). 403, no 404, si existe en otro gimnasio.
  async findOneScoped(id: string, requester: AuthenticatedUser): Promise<User> {
    const user = await this.findOne(id);
    this.assertSameGym(user, requester);
    return user;
  }

  private assertSameGym(user: User, requester: AuthenticatedUser): void {
    if (requester.role === 'SUPER_ADMIN') {
      return;
    }
    if (user.gym?.id !== requester.gymId) {
      throw new ForbiddenException('No tenés acceso a este usuario.');
    }
  }

  // 5. Guardar el token de recuperación y su fecha de expiración
  async updateResetToken(
    userId: string,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  // 6. Buscar usuario por token (Saltándose el 'select: false' por QueryBuilder)
  async findByResetToken(token: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.resetPasswordToken')
      .addSelect('user.resetPasswordExpires')
      .where('user.reset_password_token = :token', { token })
      .getOne();
  }

  // 7. Actualizar la contraseña del usuario y limpiar los tokens temporales
  async updatePasswordAndClearToken(
    userId: string,
    hashedPassword: string,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  }

  // 8. Editar Usuario
  async update(
    id: string,
    updateData: UpdateUserDto,
    requester: AuthenticatedUser,
  ): Promise<User> {
    const user = await this.findOneScoped(id, requester);
    const { roleId, gymId, ...rest } = updateData;

    if (gymId && requester.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Solo un SUPER_ADMIN puede reasignar el gimnasio de un usuario.',
      );
    }

    if (roleId && requester.role !== 'SUPER_ADMIN') {
      const targetRole = await this.roleRepository.findOne({
        where: { id: roleId },
      });
      if (!targetRole) {
        throw new BadRequestException('El rol especificado no es válido.');
      }
      if (targetRole.name === 'SUPER_ADMIN') {
        throw new ForbiddenException(
          'Solo un SUPER_ADMIN puede asignar el rol SUPER_ADMIN.',
        );
      }
    }

    const updatedUser = this.userRepository.merge(user, {
      ...rest,
      role: roleId ? { id: roleId } : user.role,
      gym: gymId ? { id: gymId } : user.gym,
    });

    return await this.userRepository.save(updatedUser);
  }

  // 8b. Eliminar usuario
  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const user = await this.findOneScoped(id, requester);
    await this.userRepository.remove(user);
  }

  // 9. Iniciar solicitud de cambio de email
  async initiateEmailChange(
    userId: string,
    newEmail: string,
  ): Promise<{ message: string }> {
    const existing = await this.userRepository.findOne({
      where: {
        email: newEmail,
        id: Not(userId),
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Este correo ya está registrado por otro usuario.',
      );
    }

    const { token, expiresAt } = this.tokenService.generate(1);
    await this.prepareEmailChange(userId, newEmail, token, expiresAt);
    await this.mailService.sendEmailChangeVerification(newEmail, token);

    return {
      message: 'Se ha enviado un enlace de confirmación a tu nuevo correo.',
    };
  }

  // Helper interno (se mantiene)
  async prepareEmailChange(
    userId: string,
    newEmail: string,
    token: string,
    tokenExpiresAt: Date,
  ): Promise<void> {
    const user = await this.findOne(userId);
    const updatedUser = this.userRepository.merge(user, {
      pendingEmail: newEmail,
      emailChangeToken: token,
      emailChangeTokenExpires: tokenExpiresAt,
    });
    await this.userRepository.save(updatedUser);
  }

  // 10. Confirmación cambio de email (se mantiene)
  async confirmEmailChange(token: string): Promise<void> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.emailChangeTokenExpires')
      .where('user.email_change_token = :token', { token })
      .getOne();

    if (!user || !user.pendingEmail) {
      throw new NotFoundException('Token inválido o expirado.');
    }

    if (this.tokenService.isExpired(user.emailChangeTokenExpires)) {
      throw new BadRequestException(
        'El enlace de verificación de correo ha expirado.',
      );
    }

    const emailExists = await this.userRepository.findOne({
      where: { email: user.pendingEmail },
    });
    if (emailExists)
      throw new BadRequestException(
        'El correo ya está en uso por otro usuario.',
      );

    await this.userRepository.update(user.id, {
      email: user.pendingEmail,
      pendingEmail: null,
      emailChangeToken: null,
      emailChangeTokenExpires: null,
    });
  }
}
