import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({
    description:
      'UUID del plan al que el socio se suscribe (E6-04: un gimnasio puede tener varios planes/niveles).',
  })
  @IsUUID()
  planId!: string;
}
