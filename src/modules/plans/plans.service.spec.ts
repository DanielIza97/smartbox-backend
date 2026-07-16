import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { PlansService } from './plans.service';
import { Plan } from './entities/plan.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('PlansService', () => {
  let service: PlansService;
  let planRepository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let gymRepository: { findOne: jest.Mock };

  const superAdmin: AuthenticatedUser = {
    id: 'super-1',
    email: 'super@smartbox.com',
    role: 'SUPER_ADMIN',
    gymId: null,
  };
  const gymAAdmin: AuthenticatedUser = {
    id: 'admin-a',
    email: 'admin-a@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };

  beforeEach(async () => {
    planRepository = {
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    gymRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlansService,
        { provide: getRepositoryToken(Plan), useValue: planRepository },
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
      ],
    }).compile();

    service = module.get(PlansService);
  });

  describe('create', () => {
    it('exige gymId', async () => {
      await expect(
        service.create({ name: 'Plan mensual', priceCents: 4999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el gimnasio no existe', async () => {
      gymRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Plan mensual',
          priceCents: 4999,
          gymId: 'gym-inexistente',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rechaza crear un segundo plan para el mismo gimnasio', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });
      planRepository.findOne.mockResolvedValue({ id: 'plan-existente' });

      await expect(
        service.create({
          name: 'Plan mensual',
          priceCents: 4999,
          gymId: 'gym-a',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('crea el plan cuando el gimnasio existe y no tiene uno todavía', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });
      planRepository.findOne.mockResolvedValue(null);

      const result = await service.create({
        name: 'Plan mensual',
        priceCents: 4999,
        gymId: 'gym-a',
      });

      expect(planRepository.save).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          name: 'Plan mensual',
          priceCents: 4999,
          gymId: 'gym-a',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('SUPER_ADMIN ve planes de todos los gimnasios', async () => {
      planRepository.find.mockResolvedValue([]);

      await service.findAll(superAdmin);

      expect(planRepository.find).toHaveBeenCalledWith({
        relations: { gym: true },
      });
    });

    it('un ADMIN solo ve el plan de su propio gimnasio', async () => {
      planRepository.find.mockResolvedValue([]);

      await service.findAll(gymAAdmin);

      expect(planRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a' },
        relations: { gym: true },
      });
    });
  });

  describe('findOne', () => {
    it('devuelve 403 (no 404) si el plan pertenece a otro gimnasio', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-b',
        gymId: 'gym-b',
      });

      await expect(service.findOne('plan-b', gymAAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permite ver el plan del propio gimnasio', async () => {
      planRepository.findOne.mockResolvedValue({
        id: 'plan-a',
        gymId: 'gym-a',
      });

      const result = await service.findOne('plan-a', gymAAdmin);
      expect(result.id).toBe('plan-a');
    });
  });
});
