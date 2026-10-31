import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentCodesService } from './student-codes.service';
import {
  CodeAuditQueryDto,
  InitializeCodeYearDto,
  RecoverStudentCodeDto,
} from './dto/student-code.dto';
import { QueryAdmissionPeriodDto } from '../admissions/dto/admission-period.dto';

@Controller('admin/student-codes')
@Roles('admin', 'staff')
export class StudentCodesController {
  constructor(private readonly codes: StudentCodesService) {}
  @Get('audit')
  @RequirePermissions(PERMISSIONS.STUDENT_CODES_READ)
  audit(@Query() query: CodeAuditQueryDto) {
    return this.codes.audit(query);
  }
  @Get(':code/history')
  @RequirePermissions(PERMISSIONS.STUDENT_CODES_READ)
  history(
    @Param('code') code: string,
    @Query() query: QueryAdmissionPeriodDto,
  ) {
    return this.codes.history(code, query.page, query.limit);
  }
  @Post('years/initialize')
  @Roles('admin')
  initialize(
    @Body() dto: InitializeCodeYearDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.initialize(dto, actorId);
  }
  @Post(':code/recover')
  @Roles('admin')
  recover(
    @Param('code') code: string,
    @Body() dto: RecoverStudentCodeDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.recover(code, dto, actorId);
  }
}
