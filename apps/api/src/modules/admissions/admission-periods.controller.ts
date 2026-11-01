import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS } from '@student-portal/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { AdmissionPeriodsService } from './admission-periods.service';
import {
  CreateAdmissionPeriodDto,
  QueryAdmissionPeriodDto,
  UpdateAdmissionPeriodDto,
  DeleteAdmissionPeriodDto,
} from './dto/admission-period.dto';

@Controller('admin/admissions/periods')
@Roles('admin', 'staff')
export class AdmissionPeriodsController {
  constructor(private readonly periods: AdmissionPeriodsService) {}

  @Get()
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_PERIODS_READ,
    PERMISSIONS.ADMISSIONS_PERIODS_MANAGE,
    PERMISSIONS.ADMISSIONS_ACCESS_MANAGE,
  )
  list(@Query() query: QueryAdmissionPeriodDto) {
    return this.periods.list(query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE)
  create(
    @Body() dto: CreateAdmissionPeriodDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.periods.create(dto, actorId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAdmissionPeriodDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.periods.update(id, dto, actorId);
  }

  @Delete(':id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_PERIODS_MANAGE)
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: DeleteAdmissionPeriodDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.periods.delete(id, dto, actorId);
  }
}
