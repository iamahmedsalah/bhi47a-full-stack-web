import type { INestApplication } from '@nestjs/common';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { UserDocument } from '../src/modules/users/schemas/user.schema';

export function defineStaffProfileAcceptance(context: {
  app: () => INestApplication;
  users: () => Model<UserDocument>;
  origin: () => string;
  accounts: Map<string, { userId: string; identifier: string }>;
  ids: string[];
  password: string;
}) {
  it('updates teaching profiles, preserves account roles and reports exact identity conflicts', async () => {
    const users = context.users();
    const targetId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    context.ids.push(String(targetId), String(otherId));
    const email = `profile-${String(targetId)}@example.test`;
    const takenUsername = `taken_${String(otherId)}`;
    await users.create({
      _id: targetId,
      name: 'Synthetic profile',
      email,
      role: 'staff',
      staffType: 'doctor',
      passwordHash: await bcrypt.hash(context.password, 4),
      isActive: true,
      mustChangePassword: false,
      permissions: [],
    });
    await users.create({
      _id: otherId,
      name: 'Other profile',
      email: `other-${String(otherId)}@example.test`,
      username: takenUsername,
      role: 'staff',
      staffType: 'doctor',
      passwordHash: await bcrypt.hash(context.password, 4),
      isActive: true,
      mustChangePassword: false,
      permissions: [],
    });
    const app = context.app();
    const signedIn = await request(app.getHttpServer())
      .post('/api/auth/admin/login')
      .set('Origin', context.origin())
      .send({
        email: context.accounts.get('admin')!.identifier,
        password: context.password,
      })
      .expect(200);
    const cookie = (signedIn.headers['set-cookie'] as unknown as string[])
      .map((value) => value.split(';')[0])
      .join('; ');
    const patch = (body: object) =>
      request(app.getHttpServer())
        .patch(`/api/admin/staff/${String(targetId)}`)
        .set('Origin', context.origin())
        .set('Cookie', cookie)
        .set('x-csrf-token', signedIn.body.csrfToken as string)
        .send(body);
    await patch({ name: 'Edited profile', role: 'staff' }).expect(400);
    const saved = await patch({
      name: 'Edited profile',
      nameAr: 'اسم عربي محدث',
      email,
      username: `staff_${String(targetId)}`,
      phone: '01281577808',
      staffType: 'assistant_lecturer',
    }).expect(200);
    expect(saved.body).toMatchObject({
      name: 'Edited profile',
      nameAr: 'اسم عربي محدث',
      role: 'staff',
      staffType: 'assistant_lecturer',
      permissions: [],
    });
    const conflict = await patch({
      email: context.accounts.get('admin')!.identifier,
    }).expect(409);
    expect(conflict.body).toMatchObject({
      code: 'STAFF_EMAIL_TAKEN',
      errors: { email: 'emailTaken' },
    });
    const usernameConflict = await patch({ username: takenUsername }).expect(
      409,
    );
    expect(usernameConflict.body).toMatchObject({
      code: 'STAFF_USERNAME_TAKEN',
      errors: { username: 'usernameTaken' },
    });
    await patch({ nameAr: 'س', username: 'bad username' }).expect(400);
    await patch({ nameAr: '', username: '', phone: '' }).expect(200);
    const persisted = await users.findById(targetId).lean();
    expect(persisted).toMatchObject({
      name: 'Edited profile',
      role: 'staff',
      permissions: [],
    });
    for (const field of ['username', 'nameAr', 'phone'])
      expect(persisted).not.toHaveProperty(field);
    await request(app.getHttpServer())
      .patch(`/api/admin/staff/${String(targetId)}`)
      .send({ name: 'Unauthorized' })
      .expect(401);
  }, 30000);
}
