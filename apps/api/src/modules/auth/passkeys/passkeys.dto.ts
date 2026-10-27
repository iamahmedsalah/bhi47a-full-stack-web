import {
  IsObject,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  IsOptional,
  IsIn,
  IsMongoId,
  IsBoolean,
} from 'class-validator';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Transform } from 'class-transformer';

export class UpdatePasskeySettingsDto {
  // Preserve the raw value: global implicit conversion turns "false" into true.
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }) => obj.studentLoginEnabled,
  )
  @IsBoolean()
  studentLoginEnabled!: boolean;
}

export class PasskeyReauthDto {
  @IsOptional() @IsIn(['register', 'rename', 'remove']) operation?:
    'register' | 'rename' | 'remove';
  @IsOptional() @IsMongoId() credentialId?: string;
  @IsString()
  @Length(1, 256)
  password!: string;
}

export class PasskeyNameDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}

export class PasskeyLoginOptionsDto {
  @IsOptional()
  @IsIn(['student', 'management'])
  area?: 'student' | 'management';
}

export class PasskeyLoginVerifyDto {
  @IsUUID('4')
  flowId!: string;

  @IsObject()
  response!: AuthenticationResponseJSON;
}

export class PasskeyRegisterVerifyDto extends PasskeyNameDto {
  @IsUUID('4')
  flowId!: string;

  @IsObject()
  response!: RegistrationResponseJSON;
}

export class PasskeyIdDto {
  @IsString()
  @MaxLength(1024)
  @Length(1)
  id!: string;
}
