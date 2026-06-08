import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // 1. Crear un usuario vinculando su Rol por ID
  async create(createUserDto: CreateUserDto): Promise<User> {
    const { roleId, ...userData } = createUserDto;

    const newUser = this.userRepository.create({
      ...userData,
      role: { id: roleId } as any, // Mapea la relación ManyToOne usando el ID del rol
      status: 'active',
    });

    return await this.userRepository.save(newUser);
  }

  // 2. NUEVO: Listar todos los usuarios (Requerido por tu UsersController)
  async findAll(): Promise<User[]> {
    return await this.userRepository.find({
      relations: { role: true }, // 👈 Sintaxis moderna de TypeORM
    });
  }

  // 3. Buscar un usuario por su Email
  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role') 
      .addSelect('user.password')          
      .where('user.email = :email', { email })
      .getOne();
  }

  // 4. Buscar un único usuario por su ID
  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { role: true }, // 👈 Sintaxis moderna de TypeORM
    });

    if (!user) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado.`);
    }

    return user;
  }

  // 🔐 5. Guardar el token de recuperación y su fecha de expiración
  async updateResetToken(userId: string, token: string, expires: Date): Promise<void> {
    await this.userRepository.update(userId, {
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    });
  }

  // 🔐 6. Buscar usuario por token (Saltándose el 'select: false' por QueryBuilder)
  async findByResetToken(token: string): Promise<User | null> {
    return await this.userRepository.createQueryBuilder('user')
      .addSelect('user.resetPasswordToken')
      .addSelect('user.resetPasswordExpires')
      .where('user.reset_password_token = :token', { token })
      .getOne();
  }

  // 🔐 7. Actualizar la contraseña del usuario y limpiar los tokens temporales
  async updatePasswordAndClearToken(userId: string, hashedPassword: string): Promise<void> {
    await this.userRepository.update(userId, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    });
  }
}