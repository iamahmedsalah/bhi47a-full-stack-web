import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@student-portal/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { AdmissionWorkflowService } from './admission-workflow.service';
import { RegistrationTermService } from '../registrations/services/registration-term.service';
import {
  AdmissionSpreadsheets,
  type AdmissionWorkbookFile,
} from './admission-spreadsheets.service';
import {
  AccessCreateDto,
  AdmissionListDto,
  ApproveApplicantDto,
  ConfirmAdmissionDto,
  CreateAdmissionGroupDto,
  DecisionDto,
  PublicAccessDto,
  PublicApplicantDto,
  PublicCorrectionDto,
  PublicStatusDto,
  UpdateAdmissionGroupDto,
  UpdateApplicantDto,
} from './dto/admission-workflow.dto';

@Controller('public/admissions')
@Public()
export class PublicAdmissionsController {
  constructor(private readonly admissions: AdmissionWorkflowService) {}
  @Post('validate') validate(@Body() dto: PublicAccessDto) {
    return this.admissions.validateAccess(dto);
  }
  @Post('requests') submit(
    @Body() dto: PublicApplicantDto,
    @Req() req: Request,
  ) {
    return this.admissions.submit(dto, req.ip);
  }
  @Post('status') status(@Body() dto: PublicStatusDto) {
    return this.admissions.publicStatus(dto);
  }
  @Post('correction') resubmit(
    @Body() dto: PublicCorrectionDto,
    @Req() req: Request,
  ) {
    return this.admissions.resubmitCorrection(dto, req.ip);
  }
}

@Controller('admin/admissions')
@Roles('admin', 'staff')
export class AdmissionWorkflowController {
  constructor(
    private readonly admissions: AdmissionWorkflowService,
    private readonly sheets: AdmissionSpreadsheets,
    private readonly registrationTerms: RegistrationTermService,
  ) {}
  @Get('academic-years')
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_GROUPS_MANAGE,
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_ACCESS_MANAGE,
    PERMISSIONS.STUDENT_CODES_READ,
    PERMISSIONS.ADMISSIONS_POLICY_MANAGE,
    PERMISSIONS.ADMISSIONS_PERIODS_MANAGE,
  )
  async academicYears() {
    const [managed, historical] = await Promise.all([
      this.registrationTerms.academicYearOptions(),
      this.admissions.academicYears(),
    ]);
    return {
      ...managed,
      managedYears: managed.items,
      items: [...new Set([...managed.items, ...historical.items])]
        .sort()
        .reverse(),
    };
  }
  @Get('requests')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_REQUESTS_READ)
  requests(
    @Query() query: AdmissionListDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.listRequests(query, actor);
  }
  @Get('requests/:id')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_REQUESTS_READ)
  detail(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.admissions.detail(id, actor);
  }
  @Delete('requests/:id')
  @Roles('admin')
  deleteRequest(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.deleteRequest(id, dto, actor);
  }
  @Patch('requests/:id')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE,
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateApplicantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.update(id, dto, actor);
  }
  @Post('requests/:id/approve')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_APPROVE,
    PERMISSIONS.ADMISSIONS_ACADEMIC_MANAGE,
  )
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveApplicantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.approve(id, dto, actor);
  }
  @Post('requests/:id/reject')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_REJECT,
  )
  reject(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.decide(id, 'REJECTED', dto, actor);
  }
  @Post('requests/:id/request-correction')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_UPDATE,
  )
  correction(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.requestCorrection(id, dto, actor);
  }
  @Post('requests/:id/waitlist')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST,
  )
  waitlist(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.decide(id, 'WAITLISTED', dto, actor);
  }
  @Post('requests/:id/pending')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_WAITLIST,
  )
  pending(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.decide(id, 'PENDING', dto, actor);
  }
  @Post('requests/:id/cancel')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_REQUESTS_CANCEL,
  )
  async cancel(
    @Param('id') id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const item = await this.admissions.detail(id, actor);
    return item.status === 'APPROVED' || item.status === 'CANCELLED'
      ? this.admissions.cancelApproved(id, dto, actor)
      : this.admissions.decide(
          id,
          'REJECTED',
          { ...dto, reasonCode: dto.reasonCode ?? 'OTHER' },
          actor,
        );
  }
  @Get('access')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE)
  access(@Query() query: AdmissionListDto) {
    return this.admissions.listAccess(query);
  }
  @Post('access')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE)
  createAccess(
    @Body() dto: AccessCreateDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.createAccess(dto, actor);
  }
  @Get('access/:id/secret')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE)
  getAccessSecret(@Param('id') id: string) {
    return this.admissions.getAccessSecret(id);
  }
  @Post('access/:id/revoke')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE)
  revoke(
    @Param('id') id: string,
    @Body() _dto: ConfirmAdmissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.revokeAccess(id, actor);
  }
  @Delete('access/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_ACCESS_MANAGE)
  deleteAccess(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.deleteAccess(id, actor);
  }
  @Get('groups')
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_GROUPS_MANAGE,
  )
  groups(@Query() query: AdmissionListDto) {
    return this.admissions.listGroups(query);
  }
  @Post('groups')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE)
  createGroup(
    @Body() dto: CreateAdmissionGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.createGroup(dto, actor);
  }
  @Get('groups/:id/students')
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_GROUPS_MANAGE,
  )
  groupStudents(@Param('id') id: string) {
    return this.admissions.getGroupStudents(id);
  }
  @Patch('groups/:id')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE)
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionGroupDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.updateGroup(id, dto, actor);
  }
  @Delete('groups/:id')
  @Roles('admin')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_GROUPS_MANAGE)
  deleteGroup(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.admissions.deleteGroup(id, actor);
  }
  @Get('xlsx/export')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_EXPORT,
  )
  async export(
    @Query() query: AdmissionListDto,
    @Res() res: Response,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    this.sendWorkbook(
      res,
      await this.sheets.workbook(query, false, actor),
      'admission-requests.xlsx',
    );
  }
  @Get('xlsx/template')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_IMPORT,
  )
  async template(@Res() res: Response) {
    this.sendWorkbook(
      res,
      await this.sheets.workbook(new AdmissionListDto(), true),
      'admission-template.xlsx',
    );
  }
  @Post('xlsx/preview')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_IMPORT,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  preview(
    @UploadedFile() file: AdmissionWorkbookFile,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sheets.preview(file, actor);
  }
  @Get('xlsx/batches/:id')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_IMPORT,
  )
  batch(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.sheets.getBatch(id, actor);
  }
  @Post('xlsx/batches/:id/apply')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_REQUESTS_READ,
    PERMISSIONS.ADMISSIONS_IMPORT,
  )
  apply(
    @Param('id') id: string,
    @Body() _dto: ConfirmAdmissionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.sheets.apply(id, actor);
  }
  private sendWorkbook(res: Response, buffer: Buffer, filename: string) {
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
