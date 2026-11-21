import {
  applyDecorators,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from '../schemas/attendance-record.schema';
import {
  AttendanceSession,
  type AttendanceSessionDocument,
} from '../schemas/attendance-session.schema';
import { attendanceSessionScope } from '../services/attendance-query';

const AttendanceTarget = Reflector.createDecorator<'session' | 'record'>();

@Injectable()
export class AttendanceSessionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(AttendanceSession.name)
    private readonly sessions: Model<AttendanceSessionDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly records: Model<AttendanceRecordDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (user?.role === 'admin') return true;
    if (user?.role !== 'staff') throw new ForbiddenException('Access denied');

    const target = this.reflector.get(AttendanceTarget, context.getHandler());
    const id = params.id;
    if (typeof id !== 'string' || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        target === 'record' ? 'معرّف السجل غير صالح' : 'معرّف الجلسة غير صالح',
      );
    }

    const sessionId =
      target === 'record'
        ? (await this.records.findById(id).select('sessionId').lean())
            ?.sessionId
        : id;
    if (
      !sessionId ||
      !(await this.sessions.exists({
        _id: sessionId,
        ...attendanceSessionScope(user),
      }))
    ) {
      throw new NotFoundException(
        target === 'record' ? 'سجل الحضور غير موجود' : 'جلسة الحضور غير موجودة',
      );
    }

    return true;
  }
}

export function RequireAttendanceSessionAccess(target: 'session' | 'record') {
  return applyDecorators(
    AttendanceTarget(target),
    UseGuards(AttendanceSessionAccessGuard),
  );
}
