import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  mixin,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { defer, lastValueFrom } from 'rxjs';
import {
  COURSE_BOOK_MAX_BYTES,
  COURSE_MATERIAL_MAX_BYTES,
} from '@student-portal/shared';
import {
  MaterialStorageService,
  type MaterialUpload,
} from '../material-storage/material-storage.service';
import { CoursesService } from './courses.service';

/** The lease covers multipart parsing, DTO pipes and metadata commit, including errors. */
@Injectable()
export class MaterialMutationInterceptor implements NestInterceptor {
  constructor(private readonly storage: MaterialStorageService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; file?: MaterialUpload }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return next.handle();
    return defer(async () => {
      const release = await this.storage.beginMutation();
      try {
        return await lastValueFrom(next.handle());
      } finally {
        await this.storage.discardTemporary(request.file?.path);
        await release();
      }
    });
  }
}

export function MaterialUploadInterceptor(
  book: boolean,
): Type<NestInterceptor> {
  @Injectable()
  class UploadInterceptor implements NestInterceptor {
    constructor(
      private readonly storage: MaterialStorageService,
      private readonly courses: CoursesService,
    ) {}
    async intercept(context: ExecutionContext, next: CallHandler) {
      const request = context.switchToHttp().getRequest();
      await this.courses.authorizeMaterialUpload(
        request.params.id,
        request.user,
        book,
      );
      // Recording links carry JSON metadata and do not consume file capacity.
      if (!book && request.is?.('application/json')) return next.handle();
      await this.storage.checkCapacity();
      const Interceptor = FileInterceptor('file', {
        dest: this.storage.temporaryDirectory,
        limits: {
          fileSize: book ? COURSE_BOOK_MAX_BYTES : COURSE_MATERIAL_MAX_BYTES,
          files: 1,
          fields: 8,
          fieldSize: 4096,
        },
      });
      return new Interceptor().intercept(context, next);
    }
  }
  return mixin(UploadInterceptor);
}
