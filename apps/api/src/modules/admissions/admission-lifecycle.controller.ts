import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@student-portal/shared';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../auth/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-request';
import { AdmissionLifecycleService } from './admission-lifecycle.service';
import {
  AdmissionFollowupCompleteDto,
  AdmissionListDto,
  LifecycleTransitionDto,
  ProvisionalPolicyScopeDto,
  UpdateProvisionalPolicyDto,
  VerifyLegacyEnrollmentDto,
} from './dto/admission-workflow.dto';
import { assertAdmissionPermission } from './admission-workflow.service';

const FOLLOWUP_TYPES = {
  settlement: 'settlement',
  contact: 'contact',
} as const;
type FollowupType = keyof typeof FOLLOWUP_TYPES;

@Controller('admin/admissions')
@Roles('admin', 'staff')
export class AdmissionPolicyController {
  constructor(private readonly lifecycle: AdmissionLifecycleService) {}

  @Get('provisional-policy')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_POLICY_MANAGE)
  @Header('Cache-Control', 'no-store')
  policy(@Query() query: ProvisionalPolicyScopeDto) {
    return this.lifecycle.policy(query);
  }

  @Patch('provisional-policy')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_POLICY_MANAGE)
  updatePolicy(
    @Body() dto: UpdateProvisionalPolicyDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.lifecycle.updatePolicy(dto, actorId);
  }

  @Get('enrollment-summary')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_REQUESTS_READ)
  @Header('Cache-Control', 'no-store')
  summary() {
    return this.lifecycle.summary();
  }

  @Post('legacy-enrollment')
  @RequirePermissions(
    PERMISSIONS.ADMISSIONS_ENROLLMENT_CONFIRM,
    PERMISSIONS.STUDENTS_READ,
  )
  verifyLegacy(
    @Body() dto: VerifyLegacyEnrollmentDto,
    @CurrentUser('_id') actorId: string,
  ) {
    return this.lifecycle.verifyLegacy(dto, actorId);
  }

  @Get('followups/:kind')
  @RequireAnyPermissions(
    PERMISSIONS.TUITION_READ,
    PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
  )
  @Header('Cache-Control', 'no-store')
  followups(
    @Param('kind', new ParseEnumPipe(FOLLOWUP_TYPES)) kind: FollowupType,
    @Query() query: AdmissionListDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    assertAdmissionPermission(
      actor,
      kind === 'settlement'
        ? PERMISSIONS.TUITION_READ
        : PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
    );
    return this.lifecycle.followups(kind, query.page, query.limit);
  }

  @Patch('followups/:kind/:id')
  @RequireAnyPermissions(
    PERMISSIONS.TUITION_WRITE,
    PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
  )
  completeFollowup(
    @Param('kind', new ParseEnumPipe(FOLLOWUP_TYPES)) kind: FollowupType,
    @Param('id') id: string,
    @Body() dto: AdmissionFollowupCompleteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    assertAdmissionPermission(
      actor,
      kind === 'settlement'
        ? PERMISSIONS.TUITION_WRITE
        : PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
    );
    return this.lifecycle.completeFollowup(kind, id, dto.reference, actor._id);
  }
}

@Controller('admin/admissions/requests/:id')
@Roles('admin', 'staff')
export class AdmissionLifecycleController {
  constructor(private readonly lifecycle: AdmissionLifecycleService) {}

  @Post('transition')
  @RequirePermissions(PERMISSIONS.ADMISSIONS_REQUESTS_READ)
  @Header('Cache-Control', 'no-store')
  transition(
    @Param('id') id: string,
    @Body() dto: LifecycleTransitionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.lifecycle.transition(id, dto, actor);
  }

  @Post('decision-documents')
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
    PERMISSIONS.ADMISSIONS_DECISIONS_CORRECT,
  )
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 4 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.lifecycle.upload(id, file, actor);
  }

  @Get('decision-documents/:documentId')
  @RequireAnyPermissions(
    PERMISSIONS.ADMISSIONS_MINISTRY_MANAGE,
    PERMISSIONS.ADMISSIONS_DECISIONS_CORRECT,
    PERMISSIONS.ADMISSIONS_ARCHIVE_READ,
  )
  async document(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="ministry-decision.pdf"',
    );
    response
      .type('application/pdf')
      .send(await this.lifecycle.document(id, documentId));
  }
}
