import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Membership } from './entities/membership.entity';

// Solo registra la entidad por ahora — el servicio/controller con la
// lógica de suscripción (subscribe, webhooks, ciclo de vida) llega en
// E2-02/E2-03, cuando exista un consumidor real.
@Module({
  imports: [TypeOrmModule.forFeature([Membership])],
  exports: [TypeOrmModule],
})
export class MembershipsModule {}
