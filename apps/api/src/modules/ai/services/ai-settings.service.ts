import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiUsageLog, AiUsageLogDocument } from '../schemas/ai-usage-log.schema';
import { AiSettings, AiSettingsDocument } from '../schemas/ai-settings.schema';
import { UpdateAiSettingsDto } from '../dto/update-ai-settings.dto';

interface UsageTotals {
  totalTokens: number;
  totalRequests: number;
  errorCount: number;
}

@Injectable()
export class AiSettingsService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(AiSettings.name)
    private readonly settings: Model<AiSettingsDocument>,
    @InjectModel(AiUsageLog.name)
    private readonly usageLogs: Model<AiUsageLogDocument>,
  ) {}

  async isStudentAdvisorEnabled(): Promise<boolean> {
    if (!this.studentAdvisorConfigured()) return false;
    const settings = await this.settings
      .findOne({ key: 'default' })
      .select('studentAdvisorEnabled')
      .lean();
    return settings?.studentAdvisorEnabled ?? this.defaultStudentAdvisorState();
  }

  async getStudentStatus() {
    return { enabled: await this.isStudentAdvisorEnabled() };
  }

  async getAdminSettings() {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const [settings, allTime, currentMonth] = await Promise.all([
      this.settings.findOne({ key: 'default' }).lean(),
      this.aggregateUsage(),
      this.aggregateUsage(startOfMonth),
    ]);

    const monthlyTokenBudget = this.readMonthlyTokenBudget();
    const remainingTokens =
      monthlyTokenBudget === null
        ? null
        : Math.max(monthlyTokenBudget - currentMonth.totalTokens, 0);
    const usagePercent =
      monthlyTokenBudget === null
        ? null
        : Math.min(
            100,
            Math.round((currentMonth.totalTokens / monthlyTokenBudget) * 100),
          );

    return {
      studentAdvisorEnabled:
        settings?.studentAdvisorEnabled ?? this.defaultStudentAdvisorState(),
      studentAdvisorConfigured: this.studentAdvisorConfigured(),
      provider: 'Gemini',
      model: this.config.get<string>('GEMINI_CHAT_MODEL', 'gemini-2.0-flash'),
      apiKeyConfigured: Boolean(this.config.get<string>('GEMINI_API_KEY', '')),
      usage: {
        allTimeTokens: allTime.totalTokens,
        allTimeRequests: allTime.totalRequests,
        allTimeErrors: allTime.errorCount,
        currentMonthTokens: currentMonth.totalTokens,
        currentMonthRequests: currentMonth.totalRequests,
        monthlyTokenBudget,
        remainingTokens,
        usagePercent,
        periodStart: startOfMonth.toISOString(),
      },
    };
  }

  async update(dto: UpdateAiSettingsDto, actorId: string) {
    await this.settings.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          studentAdvisorEnabled: dto.studentAdvisorEnabled,
          updatedBy: new Types.ObjectId(actorId),
        },
        $setOnInsert: { key: 'default' },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return this.getAdminSettings();
  }

  private async aggregateUsage(since?: Date): Promise<UsageTotals> {
    const match = since ? { createdAt: { $gte: since } } : {};
    const [totals] = await this.usageLogs.aggregate<UsageTotals>([
      { $match: match },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$totalTokens' },
          totalRequests: { $sum: 1 },
          errorCount: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ['$error', null] }, { $ne: ['$error', ''] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]);
    return totals ?? { totalTokens: 0, totalRequests: 0, errorCount: 0 };
  }

  private readMonthlyTokenBudget(): number | null {
    const value = Number(
      this.config.get<string>('AI_MONTHLY_TOKEN_BUDGET', ''),
    );
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  private defaultStudentAdvisorState(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  private studentAdvisorConfigured(): boolean {
    return (
      this.defaultStudentAdvisorState() ||
      (this.config.get<string>('STUDENT_AI_ENABLED') === 'true' &&
        Boolean(this.config.get<string>('GEMINI_API_KEY')?.trim()) &&
        Boolean(this.config.get<string>('GEMINI_CHAT_MODEL')?.trim()))
    );
  }
}
