import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AdmissionPeriod,
  AdmissionPeriodSchema,
} from './schemas/admission-period.schema';
import { AdmissionPeriodsController } from './admission-periods.controller';
import { AdmissionPeriodsService } from './admission-periods.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AdmissionPeriod.name, schema: AdmissionPeriodSchema },
    ]),
  ],
  controllers: [AdmissionPeriodsController],
  providers: [AdmissionPeriodsService],
})
export class AdmissionsModule {}
