import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './user.entity';
import { Role } from '../roles/entities/role.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
  ) {}

  async create(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const role = await this.roleRepo.findOne({
      where: { name: 'CLIENT' },
    });

    if (!role) {
      throw new Error('Role CLIENT not found');
    }

    const user = this.userRepo.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
      role,
    });

    return this.userRepo.save(user);
  }

  async findByEmail(email: string) {
    return this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findAll() {
    return this.userRepo.find({
      relations: {
        role: true,
      },
    });
  }

  async findOne(id: string) {
    return this.userRepo.findOne({
      where: { id },
      relations: {
        role: true,
      },
    });
  }
}