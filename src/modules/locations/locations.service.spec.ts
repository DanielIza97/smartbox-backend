import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { LocationsService } from './locations.service';
import { Location } from './entities/location.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { AuthenticatedUser } from '../auth/types/auth.types';

describe('LocationsService', () => {
  let service: LocationsService;
  let locationRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let gymRepository: { findOne: jest.Mock };

  const admin: AuthenticatedUser = {
    id: 'admin-1',
    email: 'admin@smartbox.com',
    role: 'ADMIN',
    gymId: 'gym-a',
  };

  const superAdmin: AuthenticatedUser = {
    id: 'super-1',
    email: 'super@smartbox.com',
    role: 'SUPER_ADMIN',
    gymId: null,
  };

  beforeEach(async () => {
    locationRepository = {
      find: jest.fn(),
      create: jest.fn((data: object) => data),
      save: jest.fn((data: object) => Promise.resolve(data)),
    };
    gymRepository = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: getRepositoryToken(Location),
          useValue: locationRepository,
        },
        { provide: getRepositoryToken(Gym), useValue: gymRepository },
      ],
    }).compile();

    service = module.get(LocationsService);
  });

  describe('create', () => {
    const dto = {
      name: 'Sucursal Norte',
      address: 'Av. Norte 123',
      gymId: 'gym-a',
    };

    it('rechaza si el gimnasio no existe', async () => {
      gymRepository.findOne.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('rechaza si no viene gymId', async () => {
      await expect(service.create({ name: 'Sucursal Norte' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('crea la sucursal cuando el gym existe', async () => {
      gymRepository.findOne.mockResolvedValue({ id: 'gym-a' });
      const result = await service.create(dto);
      expect(locationRepository.create).toHaveBeenCalledWith({
        name: 'Sucursal Norte',
        address: 'Av. Norte 123',
        gymId: 'gym-a',
      });
      expect(result).toEqual(
        expect.objectContaining({ name: 'Sucursal Norte', gymId: 'gym-a' }),
      );
    });
  });

  describe('findAll', () => {
    it('SUPER_ADMIN ve todas las sucursales sin filtro', async () => {
      locationRepository.find.mockResolvedValue([]);
      await service.findAll(superAdmin);
      expect(locationRepository.find).toHaveBeenCalledWith();
    });

    it('ADMIN ve solo las sucursales de su gimnasio', async () => {
      locationRepository.find.mockResolvedValue([]);
      await service.findAll(admin);
      expect(locationRepository.find).toHaveBeenCalledWith({
        where: { gymId: 'gym-a' },
      });
    });
  });

  describe('createDefault', () => {
    it('crea una sucursal "Sucursal Principal" para el gym', async () => {
      const result = await service.createDefault(
        'gym-a',
        'Av. Siempre Viva 123',
      );
      expect(locationRepository.create).toHaveBeenCalledWith({
        name: 'Sucursal Principal',
        address: 'Av. Siempre Viva 123',
        gymId: 'gym-a',
      });
      expect(result).toEqual(
        expect.objectContaining({
          name: 'Sucursal Principal',
          gymId: 'gym-a',
        }),
      );
    });
  });
});
