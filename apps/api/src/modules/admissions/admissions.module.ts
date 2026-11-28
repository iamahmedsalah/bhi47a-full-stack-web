import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdmissionPeriod,
  AdmissionPeriodSchema,
} from './schemas/admission-period.schema';
import { AdmissionPeriodsController } from './admission-periods.controller';
import { AdmissionPeriodsService } from './admission-periods.service';
import { StudentCodesModule } from '../student-codes/student-codes.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import {
  StudentAcademicProfile,
  StudentAcademicProfileSchema,
} from '../registrations/schemas/student-academic-profile.schema';
import { PasswordHashModule } from '../../security/password-hash.module';
import {
  AdmissionRequest,
  AdmissionRequestSchema,
  AdmissionAccess,
  AdmissionAccessSchema,
  AdmissionGroup,
  AdmissionGroupSchema,
  AdmissionImportBatch,
  AdmissionImportBatchSchema,
} from './schemas/admission-workflow.schema';
import { AdmissionSecurity } from './admission-security.service';
import { AdmissionWorkflowService } from './admission-workflow.service';
import { AdmissionSpreadsheets } from './admission-spreadsheets.service';
import {
  AdmissionLifecycleController,
  AdmissionPolicyController,
} from './admission-lifecycle.controller';
import { AdmissionLifecycleService } from './admission-lifecycle.service';
import {
  AdmissionWorkflowController,
  PublicAdmissionsController,
} from './admission-workflow.controller';

@Module({
  imports: [
    StudentCodesModule,
    RegistrationsModule,
    PasswordHashModule,
    MongooseModule.forFeature([
      { name: AdmissionPeriod.name, schema: AdmissionPeriodSchema },
      { name: AdmissionRequest.name, schema: AdmissionRequestSchema },
      { name: AdmissionAccess.name, schema: AdmissionAccessSchema },
      { name: AdmissionGroup.name, schema: AdmissionGroupSchema },
      { name: AdmissionImportBatch.name, schema: AdmissionImportBatchSchema },
      {
        name: StudentAcademicProfile.name,
        schema: StudentAcademicProfileSchema,
      },
    ]),
  ],
  controllers: [
    AdmissionPeriodsController,
    AdmissionWorkflowController,
    PublicAdmissionsController,
    AdmissionLifecycleController,
    AdmissionPolicyController,
  ],
  providers: [
    AdmissionPeriodsService,
    AdmissionSecurity,
    AdmissionWorkflowService,
    AdmissionSpreadsheets,
    AdmissionLifecycleService,
  ],
})
export class AdmissionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_request: Request, response: Response, next: NextFunction) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
      })
      .forRoutes(AdmissionWorkflowController, PublicAdmissionsController);
  }
}
