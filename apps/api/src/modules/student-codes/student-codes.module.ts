import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  AdmissionPeriod,
  AdmissionPeriodSchema,
} from '../admissions/schemas/admission-period.schema';
import {
  StudentCodeEntry,
  StudentCodeEntrySchema,
  StudentCodeYear,
  StudentCodeYearSchema,
  StudentCodeAuditLog,
  StudentCodeAuditLogSchema,
} from './schemas/student-code.schema';
import { StudentCodeStore } from './student-code-store.service';
import { StudentCodeAllocator } from './student-code-allocator.service';
import { AdmissionTransactions } from './admission-transactions.service';
import { StudentCodesService } from './student-codes.service';
import { StudentCodesController } from './student-codes.controller';
import { StudentCodeMappingsService } from './student-code-mappings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: AdmissionPeriod.name, schema: AdmissionPeriodSchema },
      { name: StudentCodeEntry.name, schema: StudentCodeEntrySchema },
      { name: StudentCodeYear.name, schema: StudentCodeYearSchema },
      { name: StudentCodeAuditLog.name, schema: StudentCodeAuditLogSchema },
    ]),
  ],
  controllers: [StudentCodesController],
  providers: [
    StudentCodeStore,
    StudentCodeAllocator,
    AdmissionTransactions,
    StudentCodesService,
    StudentCodeMappingsService,
  ],
  exports: [StudentCodeAllocator, StudentCodeStore, AdmissionTransactions],
})
export class StudentCodesModule {}
