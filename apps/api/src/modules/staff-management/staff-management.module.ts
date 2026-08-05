import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StaffManagementController } from './staff-management.controller';
import { StaffManagementService } from './staff-management.service';
import {
  StaffAuditLog,
  StaffAuditLogSchema,
} from './schemas/staff-audit-log.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: StaffAuditLog.name, schema: StaffAuditLogSchema },
    ]),
  ],
  controllers: [StaffManagementController],
  providers: [StaffManagementService],
  exports: [StaffManagementService],
})
export class StaffManagementModule {}
