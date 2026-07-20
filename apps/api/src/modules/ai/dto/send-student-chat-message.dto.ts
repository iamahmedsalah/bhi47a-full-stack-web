import {
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendStudentChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsMongoId()
  sessionId?: string;

  @IsOptional()
  @IsIn(['ar', 'en'])
  locale?: 'ar' | 'en';
}
