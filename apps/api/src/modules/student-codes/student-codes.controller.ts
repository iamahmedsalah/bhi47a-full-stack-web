import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentCodesService } from './student-codes.service';
import { StudentCodeAdminService } from './student-code-admin.service';
import { StudentCodeMappingsService } from './student-code-mappings.service';
import {
  CodeAuditQueryDto,
  CodeHistoryQueryDto,
  InitializeCodeYearDto,
  RecoverStudentCodeDto,
  CorrectCodeMappingsDto,
  ManageStudentCodeDto,
} from './dto/student-code.dto';

@Controller('admin/student-codes')
@Roles('admin', 'staff')
export class StudentCodesController {
  constructor(
    private readonly codes: StudentCodesService,
    private readonly mappings: StudentCodeMappingsService,
    private readonly administration: StudentCodeAdminService,
  ) {}
  @Get('mappings/preview')
  @Roles('admin')
  mappingPreview() {
    return this.mappings.preview();
  }
  @Post('mappings/correct')
  @Roles('admin')
  correctMappings(
    @Body() dto: CorrectCodeMappingsDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.mappings.correct(dto, actorId);
  }
  @Get('audit')
  @RequirePermissions(PERMISSIONS.STUDENT_CODES_READ)
  audit(@Query() query: CodeAuditQueryDto) {
    return this.codes.audit(query);
  }
  @Post(':code/manage')
  @Roles('admin')
  manage(
    @Param('code') code: string,
    @Body() dto: ManageStudentCodeDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.administration.manage(code, dto, actorId);
  }
  @Get('audit/export')
  @RequirePermissions(
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.STUDENT_CODES_EXPORT,
  )
  async export(@Query() query: CodeAuditQueryDto, @Res() res: Response) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="student-code-audit.xlsx"; filename*=UTF-8\'\'student-code-audit.xlsx',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(await this.codes.exportAudit(query));
  }
  @Get(':code/history')
  @RequirePermissions(PERMISSIONS.STUDENT_CODES_READ)
  history(@Param('code') code: string, @Query() query: CodeHistoryQueryDto) {
    return this.codes.history(code, query.page, query.limit);
  }
  @Post('years/initialize')
  @RequirePermissions(
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.STUDENT_CODES_MANAGE,
  )
  initialize(
    @Body() dto: InitializeCodeYearDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.initialize(dto, actorId);
  }
  @Post(':code/recover')
  @RequirePermissions(
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.STUDENT_CODES_RECOVER,
  )
  recover(
    @Param('code') code: string,
    @Body() dto: RecoverStudentCodeDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.recover(code, dto, actorId);
  }
  @Post(':code/delete-student')
  @RequirePermissions(
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.STUDENT_CODES_DELETE_STUDENT,
  )
  deleteStudent(
    @Param('code') code: string,
    @Body() dto: InitializeCodeYearDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.deleteStudent(code, dto, actorId);
  }
  @Post(':code/hold')
  @RequirePermissions(
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.STUDENT_CODES_MANAGE,
  )
  hold(
    @Param('code') code: string,
    @Body() dto: InitializeCodeYearDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.codes.holdPreviousOwner(code, dto, actorId);
  }
}
