import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('admin')
@UseGuards(RolesGuard)
export class AdminController {

  @Get()
  @Roles('ADMIN')
  getAdminData() {
    return { message: 'Solo ADMIN puede ver esto' };
  }
}