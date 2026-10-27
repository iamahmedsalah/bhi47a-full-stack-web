import { Global, Module } from '@nestjs/common';
import { PasswordHasher, defaultPasswordHasher } from './password-hasher';

@Global()
@Module({
  providers: [{ provide: PasswordHasher, useValue: defaultPasswordHasher }],
  exports: [PasswordHasher],
})
export class PasswordHashModule {}
