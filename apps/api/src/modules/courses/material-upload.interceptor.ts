import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  mixin,
  type Type,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { defer, lastValueFrom } from 'rxjs';
import {
  COURSE_BOOK_MAX_BYTES,
  COURSE_MATERIAL_MAX_BYTES,
  COURSE_MATERIAL_MAX_FILES,
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
    const request = context.switchToHttp().getRequest<{
      method: string;
      file?: MaterialUpload;
      files?: MaterialUpload[];
    }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      return next.handle();
    return defer(async () => {
      const release = await this.storage.beginMutation();
      try {
        return await lastValueFrom(next.handle());
      } finally {
        try {
          await Promise.all(
            [request.file, ...(request.files ?? [])]
              .filter(Boolean)
              .map((file) => this.storage.discardTemporary(file?.path)),
          );
        } finally {
          await release();
        }
      }
    });
  }
}

export function MaterialUploadInterceptor(
  book: boolean,
  edit = false,
): Type<NestInterceptor> {
  @Injectable()
  class UploadInterceptor implements NestInterceptor {
    constructor(
      private readonly storage: MaterialStorageService,
      private readonly courses: CoursesService,
    ) {}
    async intercept(context: ExecutionContext, next: CallHandler) {
      const request = context.switchToHttp().getRequest();
      if (edit)
        await this.courses.authorizeMaterialEdit(
          request.params.materialId,
          request.user,
        );
      else
        await this.courses.authorizeMaterialUpload(
          request.params.id,
          request.user,
          book,
        );
      // Recording links carry JSON metadata and do not consume file capacity.
      if (!book && request.is?.('application/json')) return next.handle();
      await this.storage.checkCapacity();
      const options = {
        dest: this.storage.temporaryDirectory,
        limits: {
          fileSize: book ? COURSE_BOOK_MAX_BYTES : COURSE_MATERIAL_MAX_BYTES,
          files: book ? 1 : COURSE_MATERIAL_MAX_FILES,
          fields: 8,
          fieldSize: 4096,
        },
      };
      const Interceptor = book
        ? FileInterceptor('file', options)
        : FilesInterceptor('file', COURSE_MATERIAL_MAX_FILES, options);
      return new Interceptor().intercept(context, next);
    }
  }
  return mixin(UploadInterceptor);
}
