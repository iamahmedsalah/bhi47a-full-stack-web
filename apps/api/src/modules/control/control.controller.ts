import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import {
  ApplyChangesDto,
  ControlAuditQueryDto,
  ControlEntriesQueryDto,
  ControlTermQueryDto,
  LockSheetDto,
  OpenSheetDto,
  UnlockSheetDto,
  UpdateGradingSchemeDto,
} from './dto/control.dto';
import { ControlAccessService } from './services/control-access.service';
import { ControlGradesService } from './services/control-grades.service';
import { ControlSheetsService } from './services/control-sheets.service';
import { GradingSchemeService } from './services/grading-scheme.service';

/**
 * Thin routing layer. Every route requires `control.access`; finer permissions
 * and the course scope are enforced again inside the services.
 */
@ApiTags('Control')
@Controller('admin/control')
@Roles('admin', 'staff')
@RequirePermissions(PERMISSIONS.CONTROL_ACCESS)
export class ControlController {
  constructor(
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
    private readonly grades: ControlGradesService,
    private readonly schemes: GradingSchemeService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Control capabilities of the current user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.access.getCapabilities(user);
  }

  @Get('courses')
  @ApiOperation({ summary: 'Courses the user may open for a term' })
  listCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ControlTermQueryDto,
  ) {
    return this.sheets.listCourses(user, query);
  }

  @Post('sheets')
  @ApiOperation({ summary: 'Open (get or create) a sheet' })
  openSheet(@CurrentUser() user: AuthenticatedUser, @Body() dto: OpenSheetDto) {
    return this.sheets.openSheet(user, dto);
  }

  @Get('sheets/:id')
  getSheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
  ) {
    return this.sheets.getSheet(user, id);
  }

  @Get('sheets/:id/entries')
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ControlEntriesQueryDto,
  ) {
    return this.sheets.listEntries(user, id, query);
  }

  @Patch('sheets/:id/entries')
  @ApiOperation({ summary: 'Apply a batch of grade changes (grid autosave)' })
  applyChanges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ApplyChangesDto,
  ) {
    return this.grades.applyChanges(user, id, dto, 'GRID');
  }

  @Post('sheets/:id/lock')
  lock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: LockSheetDto,
  ) {
    return this.sheets.lock(user, id, dto.reason);
  }

  @Post('sheets/:id/unlock')
  unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UnlockSheetDto,
  ) {
    return this.sheets.unlock(user, id, dto.reason);
  }

  @Get('sheets/:id/audit')
  listAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Query() query: ControlAuditQueryDto,
  ) {
    return this.sheets.listAudit(user, id, query);
  }

  @Get('schemes/:courseId')
  async getScheme(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseObjectIdPipe) courseId: string,
    @Query() query: ControlTermQueryDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    return this.schemes.getScheme(courseId, query.academicYear, query.semester);
  }

  @Put('schemes/:courseId')
  @ApiOperation({ summary: 'Set maximum marks / step per component' })
  updateScheme(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseObjectIdPipe) courseId: string,
    @Body() dto: UpdateGradingSchemeDto,
  ) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SCHEMES_MANAGE);
    return this.schemes.updateScheme(user._id, courseId, dto);
  }
}
