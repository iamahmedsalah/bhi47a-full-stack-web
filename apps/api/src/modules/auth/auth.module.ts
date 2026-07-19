import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthLoginService } from './services/auth-login.service';
import { AuthPasswordService } from './services/auth-password.service';
import { AuthSessionService } from './services/auth-session.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { FirstLoginGuard } from './guards/first-login.guard';
import { UsersModule } from '../users/users.module';
import { EmailsModule } from '../emails/emails.module';
import {
  StudentProfile,
  StudentProfileSchema,
} from '../students/schemas/student-profile.schema';
import {
  AcademicEmail,
  AcademicEmailSchema,
} from '../academic-emails/schemas/academic-email.schema';

@Module({
  imports: [
    UsersModule,
    EmailsModule,
    MongooseModule.forFeature([
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: AcademicEmail.name, schema: AcademicEmailSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthLoginService,
    AuthPasswordService,
    AuthSessionService,
    JwtStrategy,
    // Global guards - applied to all routes
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FirstLoginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [
    AuthService,
    AuthLoginService,
    AuthPasswordService,
    AuthSessionService,
  ],
})
export class AuthModule {}
