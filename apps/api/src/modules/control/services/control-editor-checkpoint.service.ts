import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PERMISSIONS } from '@student-portal/shared';
import type { Model } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/types/authenticated-request';
import type { ControlCheckpointDto } from '../dto/control-checkpoint.dto';
import { ControlEditorCheckpoint } from '../schemas/control-editor-checkpoint.schema';
import { ControlAccessService } from './control-access.service';
import { ControlSheetsService } from './control-sheets.service';

@Injectable()
export class ControlEditorCheckpointService {
  constructor(
    @InjectModel(ControlEditorCheckpoint.name)
    private readonly checkpoints: Model<ControlEditorCheckpoint>,
    private readonly access: ControlAccessService,
    private readonly sheets: ControlSheetsService,
  ) {}

  private async key(user: AuthenticatedUser, sheetId: string) {
    this.access.assertPermission(user, PERMISSIONS.CONTROL_SHEETS_VIEW);
    const { sheet } = await this.sheets.requireSheetInScope(user, sheetId);
    return `${user._id}:${sheet._id.toHexString()}`;
  }

  async get(user: AuthenticatedUser, sheetId: string) {
    const key = await this.key(user, sheetId);
    return this.checkpoints
      .findById(key)
      .select('studentId field sort descending filter onlyMissing search -_id')
      .lean();
  }

  async save(
    user: AuthenticatedUser,
    sheetId: string,
    dto: ControlCheckpointDto,
  ) {
    if (dto.expectedActorId !== user._id)
      throw new ForbiddenException('The active account changed');
    const key = await this.key(user, sheetId);
    await this.checkpoints.updateOne(
      { _id: key },
      {
        $set: {
          studentId: dto.studentId ?? null,
          field: dto.field,
          sort: dto.sort,
          descending: dto.descending,
          filter: dto.filter,
          onlyMissing: dto.onlyMissing,
          search: dto.search,
        },
      },
      { upsert: true },
    );
    return { saved: true };
  }
}
