import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../../common/token/token.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly tokenService: TokenService,
  ) {}

  // 1. Crear un usuario vinculando su Rol por ID
  async create(createUserDto: CreateUserDto): Promise<User> {
    const { roleId, ...userData } = createUserDto;

    const newUser = this.userRepository.create({
      ...userData,
      role: { id: roleId },
      status: 'active',
    });

    try {
      return await this.userRepository.save(newUser);
    } catch {
      throw new BadRequestException(
        'No se pudo crear el usuario. Verifica que el Rol sea válido.',
      );
    }
  }

  // 2. Listar todos los usuarios
  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      relations: { role: true },
    });
  }

  // 3. Buscar un usuario por su Email
  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  // 4. Buscar un único usuario por su ID
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    return user;
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
  async update(id: string, updateData: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    const { roleId, ...rest } = updateData;

    const updatedUser = this.userRepository.merge(user, {
      ...rest,
      role: roleId ? { id: roleId } : user.role,
    });

    return await this.userRepository.save(updatedUser);
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
