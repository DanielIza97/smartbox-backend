import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { RequestWithUser } from '../auth/types/auth.types';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiOperation({
    summary: 'Ocupación por turno de clase en un rango de fechas (E4-03)',
  })
  @Roles('ADMIN', 'STAFF')
  @Get('occupancy')
  getOccupancy(
    @Query() query: ReportQueryDto,
    @Request() req: RequestWithUser,
  ) {
    return this.reportsService.getOccupancy(req.user!, query);
  }

  @ApiOperation({
    summary:
      'Ingresos por día en un rango de fechas y socios activos actuales (E4-03)',
  })
  @Roles('ADMIN')
  @Get('revenue')
  getRevenue(@Query() query: ReportQueryDto, @Request() req: RequestWithUser) {
    return this.reportsService.getRevenue(req.user!, query);
  }

  @ApiOperation({
    summary: 'MRR, ARR, churn y LTV del gimnasio en un rango de fechas',
  })
  @Roles('ADMIN')
  @Get('finance')
  getFinance(@Query() query: ReportQueryDto, @Request() req: RequestWithUser) {
    return this.reportsService.getFinance(req.user!, query);
  }
}
