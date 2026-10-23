import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { UsersService } from '../../users/users.service';
import type { EmailsService } from '../../emails/emails.service';
import type { AuthSessionService } from './auth-session.service';
import { AuthLoginService } from './auth-login.service';
import { AuthPasswordService } from './auth-password.service';

describe('request language reaches authentication email delivery', () => {
  it.each(['ar', 'en'] as const)(
    'delivers Google and recovery emails in %s',
    async (lang) => {
      const user = {
        _id: '507f1f77bcf86cd799439011',
        role: 'student',
        name: 'Test Student',
        email: 'student@example.edu',
        save: jest.fn().mockResolvedValue(undefined),
      };
      const users = {
        findById: jest.fn().mockResolvedValue(user),
        findByIdentifier: jest.fn().mockResolvedValue(user),
        prepareGoogleLink: jest
          .fn()
          .mockResolvedValue({ user: {}, otp: '012345' }),
      } as unknown as UsersService;
      const send = jest.fn().mockResolvedValue({});
      const emails = { send } as unknown as EmailsService;
      const config = new ConfigService({
        CLIENT_URL: 'https://portal.example.edu',
        NODE_ENV: 'production',
      });
      const session = {} as AuthSessionService;
      const jwt = {} as JwtService;
      await new AuthLoginService(
        users,
        session,
        jwt,
        config,
        emails,
      ).startGoogleLink(user._id, user.email, `${lang}-EG`);
      await new AuthPasswordService(
        users,
        session,
        jwt,
        config,
        emails,
        {} as never,
        {} as never,
      ).forgotPassword({ identifier: '2026001' }, lang);
      expect(send).toHaveBeenCalledTimes(2);
      for (const [email] of send.mock.calls) {
        expect(email.subject).toContain(
          lang === 'ar' ? 'بوابة الطالب' : 'Student Portal',
        );
        expect(email.html).toContain(`lang="${lang}"`);
        expect(email.html).toContain(`email-code.html#lang=${lang}&amp;code=`);
        expect(email.text).toBeTruthy();
      }
      expect(send.mock.calls[0][0].subject).not.toBe(
        send.mock.calls[1][0].subject,
      );
    },
  );
});
