import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GpaRegistrationRule,
  GpaRegistrationRuleDocument,
} from '../schemas/gpa-registration-rule.schema';
import {
  CreateGpaRegistrationRuleDto,
  UpdateGpaRegistrationRuleDto,
} from '../dto/registration.dto';

export interface EffectiveRule {
  minGpa: number;
  maxGpa: number;
  minCreditHours: number;
  maxCreditHours: number;
  minCourses: number;
  maxCourses: number;
  requiresAdvisor: boolean;
  requireForFailedCourses: boolean;
  requireForAcademicWarnings: boolean;
  academicWarningThreshold: number;
  requireForIncompleteCourses: boolean;
  requireForGraduationPlans: boolean;
  requireForSummerRegistration: boolean;
  exemptNewStudentsFromGpaRule: boolean;
}

@Injectable()
export class GpaRuleService {
  constructor(
    @InjectModel(GpaRegistrationRule.name)
    private readonly gpaRuleModel: Model<GpaRegistrationRuleDocument>,
  ) {}

  async createGpaRule(dto: CreateGpaRegistrationRuleDto) {
    this.assertValidRuleRange(dto.minGpa, dto.maxGpa);
    this.assertValidRegistrationLimits(
      dto.minCreditHours ?? 10,
      dto.maxCreditHours,
      dto.minCourses ?? 4,
      dto.maxCourses ?? 6,
    );
    return new this.gpaRuleModel(dto).save();
  }

  async listGpaRules() {
    return this.gpaRuleModel.find().sort({ minGpa: 1 }).lean();
  }

  async updateGpaRule(id: string, dto: UpdateGpaRegistrationRuleDto) {
    const existing = await this.gpaRuleModel.findById(id);
    if (!existing) throw new NotFoundException('GPA rule not found');

    const minGpa = dto.minGpa ?? existing.minGpa;
    const maxGpa = dto.maxGpa ?? existing.maxGpa;
    this.assertValidRuleRange(minGpa, maxGpa);
    this.assertValidRegistrationLimits(
      dto.minCreditHours ?? existing.minCreditHours ?? 10,
      dto.maxCreditHours ?? existing.maxCreditHours,
      dto.minCourses ?? existing.minCourses ?? 4,
      dto.maxCourses ?? existing.maxCourses ?? 6,
    );

    return this.gpaRuleModel.findByIdAndUpdate(
      id,
      { $set: dto },
      { new: true },
    );
  }

  async deleteGpaRule(id: string) {
    await this.gpaRuleModel.findByIdAndDelete(id);
    return { message: 'GPA rule deleted successfully' };
  }

  async getRuleForGpa(gpa: number): Promise<EffectiveRule> {
    const rules = await this.gpaRuleModel.find().sort({ minGpa: 1 }).lean();
    const matched = rules.find((r) => gpa >= r.minGpa && gpa <= r.maxGpa);

    if (matched) {
      return {
        minGpa: matched.minGpa,
        maxGpa: matched.maxGpa,
        minCreditHours: matched.minCreditHours,
        maxCreditHours: matched.maxCreditHours,
        minCourses: matched.minCourses,
        maxCourses: matched.maxCourses,
        requiresAdvisor: matched.requiresAdvisor,
        requireForFailedCourses: matched.requireForFailedCourses ?? true,
        requireForAcademicWarnings: matched.requireForAcademicWarnings ?? true,
        academicWarningThreshold: matched.academicWarningThreshold ?? 1,
        requireForIncompleteCourses:
          matched.requireForIncompleteCourses ?? true,
        requireForGraduationPlans: matched.requireForGraduationPlans ?? false,
        requireForSummerRegistration:
          matched.requireForSummerRegistration ?? true,
        exemptNewStudentsFromGpaRule:
          matched.exemptNewStudentsFromGpaRule ?? true,
      };
    }

    if (gpa < 2.0) {
      return {
        minGpa: 0,
        maxGpa: 1.99,
        minCreditHours: 9,
        maxCreditHours: 12,
        minCourses: 3,
        maxCourses: 4,
        requiresAdvisor: true,
        requireForFailedCourses: true,
        requireForAcademicWarnings: true,
        academicWarningThreshold: 1,
        requireForIncompleteCourses: true,
        requireForGraduationPlans: false,
        requireForSummerRegistration: true,
        exemptNewStudentsFromGpaRule: true,
      };
    }

    if (gpa >= 3.0) {
      return {
        minGpa: 3.0,
        maxGpa: 4.0,
        minCreditHours: 12,
        maxCreditHours: 21,
        minCourses: 4,
        maxCourses: 7,
        requiresAdvisor: false,
        requireForFailedCourses: true,
        requireForAcademicWarnings: true,
        academicWarningThreshold: 1,
        requireForIncompleteCourses: true,
        requireForGraduationPlans: false,
        requireForSummerRegistration: true,
        exemptNewStudentsFromGpaRule: true,
      };
    }

    return {
      minGpa: 2.0,
      maxGpa: 2.99,
      minCreditHours: 12,
      maxCreditHours: 18,
      minCourses: 4,
      maxCourses: 6,
      requiresAdvisor: false,
      requireForFailedCourses: true,
      requireForAcademicWarnings: true,
      academicWarningThreshold: 1,
      requireForIncompleteCourses: true,
      requireForGraduationPlans: false,
      requireForSummerRegistration: true,
      exemptNewStudentsFromGpaRule: true,
    };
  }

  private assertValidRuleRange(minGpa: number, maxGpa: number) {
    if (minGpa < 0 || maxGpa > 4 || minGpa >= maxGpa) {
      throw new BadRequestException('Invalid GPA range');
    }
  }

  private assertValidRegistrationLimits(
    minCreditHours: number,
    maxCreditHours: number,
    minCourses: number,
    maxCourses: number,
  ) {
    if (
      minCreditHours <= 0 ||
      maxCreditHours <= 0 ||
      minCreditHours > maxCreditHours
    ) {
      throw new BadRequestException('Invalid credit hour limits');
    }
    if (minCourses <= 0 || maxCourses <= 0 || minCourses > maxCourses) {
      throw new BadRequestException('Invalid course limits');
    }
  }
}
