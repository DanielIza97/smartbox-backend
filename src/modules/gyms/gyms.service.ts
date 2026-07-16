import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Gym } from './entities/gym.entity';
import { CreateGymDto } from './dto/create-gym.dto';

@Injectable()
export class GymsService {
  constructor(
    @InjectRepository(Gym)
    private readonly gymRepository: Repository<Gym>,
  ) {}

  async create(dto: CreateGymDto): Promise<Gym> {
    const gym = this.gymRepository.create(dto);
    return await this.gymRepository.save(gym);
  }

  async findAll(): Promise<Gym[]> {
    return await this.gymRepository.find();
  }

  async findOne(id: string): Promise<Gym> {
    const gym = await this.gymRepository.findOne({ where: { id } });
    if (!gym) {
      throw new NotFoundException(`Gimnasio con ID ${id} no encontrado.`);
    }
    return gym;
  }
}
