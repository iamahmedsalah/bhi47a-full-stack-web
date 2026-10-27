import type { INestApplication } from '@nestjs/common';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AddressInfo } from 'node:net';
type PublicKeyCredentialCreationOptionsJSON = Parameters<
  typeof PublicKeyCredential.parseCreationOptionsFromJSON
>[0];
type PublicKeyCredentialRequestOptionsJSON = Parameters<
  typeof PublicKeyCredential.parseRequestOptionsFromJSON
>[0];
import type {
  PasskeyCredential,
  PasskeyFlow,
} from '../src/modules/auth/passkeys/passkey.schemas';

type AccountRole = 'student' | 'admin' | 'staff';
interface Fixture {
  app: INestApplication;
  origin: string;
  userId: string;
  identifier: string;
  password: string;
  role: AccountRole;
}
interface Flow {
  flowId: string;
  flowToken: string;
  options: PublicKeyCredentialRequestOptionsJSON;
}
interface Key {
  _id: string;
  name: string;
  backedUp: boolean;
}

// Real Chromium navigator.credentials + CDP authenticator + HTTP guards + Mongo.
// This deliberately does not claim hardware/biometric/cloud-sync interoperability.
export function definePasskeyBrowserAcceptance(
  account: (role: AccountRole) => Fixture,
) {
  let role: AccountRole = 'student';
  const fixture = () => account(role);
  describe('Chromium WebAuthn acceptance (virtual authenticators, private contexts)', () => {
    let browser: Browser;
    let baseURL: string;
    let context: BrowserContext;
    let page: Page;
    let cdp: CDPSession;
    let authenticatorId: string;
    let csrf: string;
    const flowIds: string[] = [];

    beforeAll(async () => {
      if (!fixture().userId)
        throw new Error('API account fixtures did not initialize');
      const { chromium } = await import('playwright');
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      });
      await fixture().app.listen(0, 'localhost');
      baseURL = `http://localhost:${(fixture().app.getHttpServer().address() as AddressInfo).port}/api`;
    });
    afterAll(async () => {
      await browser?.close();
    });
    afterEach(async () => {
      await context?.close();
      const { app, userId } = fixture();
      if (!userId) return;
      await app
        .get<Model<PasskeyCredential>>(getModelToken('PasskeyCredential'))
        .deleteMany({ userId });
      await app
        .get<Model<PasskeyFlow>>(getModelToken('PasskeyFlow'))
        .deleteMany({
          $or: [{ userId }, { flowId: { $in: flowIds.splice(0) } }],
        });
    });

    async function start(transport: 'internal' | 'usb') {
      context = await browser.newContext(); // fresh private context for each test
      page = await context.newPage();
      await page.goto(fixture().origin);
      cdp = await context.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      ({ authenticatorId } = await cdp.send(
        'WebAuthn.addVirtualAuthenticator',
        {
          options: {
            protocol: 'ctap2',
            transport,
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            automaticPresenceSimulation: true,
            defaultBackupEligibility: transport === 'internal',
            defaultBackupState: transport === 'internal',
          },
        },
      ));
      csrf = '';
    }
    async function api<T = Record<string, unknown>>(
      path: string,
      body?: unknown,
      method = 'POST',
      proof?: string,
    ) {
      return page.evaluate(
        async (input) => {
          const response = await fetch(input.url, {
            method: input.method,
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(input.csrf ? { 'x-csrf-token': input.csrf } : {}),
              ...(input.proof ? { 'x-passkey-flow': input.proof } : {}),
            },
            body:
              input.body === undefined ? undefined : JSON.stringify(input.body),
          });
          return {
            status: response.status,
            body: (await response.json()) as T,
          };
        },
        { url: baseURL + path, body, method, csrf, proof },
      );
    }
    async function passwordLogin() {
      const { identifier, password, userId, role } = fixture();
      const endpoint =
        role === 'student' ? '/auth/student/login' : '/auth/admin/login';
      const payload =
        role === 'student'
          ? { studentCode: identifier, password }
          : { email: identifier, password };
      const result = await api<{ csrfToken: string; user: { _id: string } }>(
        endpoint,
        payload,
      );
      expect(result.status).toBe(200);
      expect(result.body.user._id).toBe(userId);
      csrf = result.body.csrfToken;
    }
    async function register() {
      expect(
        (
          await api('/auth/passkeys/reauthenticate', {
            password: fixture().password,
            operation: 'register',
          })
        ).status,
      ).toBe(200);
      const options = await api<{
        flowId: string;
        options: PublicKeyCredentialCreationOptionsJSON;
      }>('/auth/passkeys/register/options');
      expect(options.status).toBe(200);
      flowIds.push(options.body.flowId);
      const response = await page.evaluate(async (json) => {
        const credential = (await navigator.credentials.create({
          publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(json),
        })) as PublicKeyCredential;
        return credential.toJSON();
      }, options.body.options);
      expect(
        (
          await api('/auth/passkeys/register/verify', {
            flowId: options.body.flowId,
            response,
            name: 'Tampered owner',
            userId: '507f1f77bcf86cd799439099',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await api('/auth/passkeys/register/verify', {
            flowId: options.body.flowId,
            response,
            name: 'Virtual acceptance key',
          })
        ).status,
      ).toBe(200);
    }
    async function loginOptions() {
      const result = await api<Flow>('/auth/passkeys/login/options', {
        area: role === 'student' ? 'student' : 'management',
      });
      expect(result.status).toBe(200);
      flowIds.push(result.body.flowId);
      return result.body;
    }
    async function assertion(flow: Flow) {
      return page.evaluate(async (json) => {
        const credential = (await navigator.credentials.get({
          publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(json),
        })) as PublicKeyCredential;
        return credential.toJSON();
      }, flow.options);
    }
    async function passkeyLogin() {
      const flow = await loginOptions();
      const response = await assertion(flow);
      const result = await api<{ csrfToken: string; user: { _id: string } }>(
        '/auth/passkeys/login/verify',
        { flowId: flow.flowId, response },
        'POST',
        flow.flowToken,
      );
      expect(result.status).toBe(200);
      expect(result.body.user._id).toBe(fixture().userId);
      csrf = result.body.csrfToken;
      expect(
        (
          await api(
            '/auth/passkeys/login/verify',
            { flowId: flow.flowId, response },
            'POST',
            flow.flowToken,
          )
        ).status,
      ).toBe(401);
      expect((await api('/auth/me', undefined, 'GET')).status).toBe(200);
    }

    it.each([
      ['student', 'internal'],
      ['admin', 'internal'],
      ['admin', 'usb'],
      ['staff', 'internal'],
      ['staff', 'usb'],
    ] as const)(
      'registers, logs in, rejects grant replay, removes and recovers as %s with %s transport',
      async (accountRole, transport) => {
        role = accountRole;
        await start(transport);
        await passwordLogin();
        expect((await api('/auth/passkeys/register/options')).status).toBe(403);
        await register();
        const keys = await api<Key[]>('/auth/passkeys', undefined, 'GET');
        expect(keys.status).toBe(200);
        expect(keys.body).toHaveLength(1);
        const key = keys.body[0];
        expect(key.backedUp).toBe(transport === 'internal');
        expect((await api('/auth/logout')).status).toBe(200);
        csrf = '';
        const wrongArea = await api<Flow>('/auth/passkeys/login/options', {
          area: role === 'student' ? 'management' : 'student',
        });
        flowIds.push(wrongArea.body.flowId);
        const wrongResponse = await assertion(wrongArea.body);
        expect(
          (
            await api(
              '/auth/passkeys/login/verify',
              { flowId: wrongArea.body.flowId, response: wrongResponse },
              'POST',
              wrongArea.body.flowToken,
            )
          ).status,
        ).toBe(401);
        expect((await api('/auth/me', undefined, 'GET')).status).toBe(401);
        await passkeyLogin();
        expect(
          (
            await api('/auth/passkeys/reauthenticate', {
              password: fixture().password,
              operation: 'rename',
              credentialId: key._id,
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await api(
              `/auth/passkeys/${key._id}`,
              { name: 'Renamed virtual key' },
              'PATCH',
            )
          ).status,
        ).toBe(200);
        expect(
          (await api(`/auth/passkeys/${key._id}`, { name: 'Replay' }, 'PATCH'))
            .status,
        ).toBe(403);
        expect(
          (await api(`/auth/passkeys/${key._id}`, undefined, 'DELETE')).status,
        ).toBe(403);
        expect(
          (
            await api('/auth/passkeys/reauthenticate', {
              password: fixture().password,
              operation: 'remove',
              credentialId: key._id,
            })
          ).status,
        ).toBe(200);
        expect(
          (await api(`/auth/passkeys/${key._id}`, undefined, 'DELETE')).status,
        ).toBe(200);
        expect((await api('/auth/logout')).status).toBe(200);
        csrf = '';
        const flow = await loginOptions();
        const response = await assertion(flow);
        expect(
          (
            await api(
              '/auth/passkeys/login/verify',
              { flowId: flow.flowId, response },
              'POST',
              flow.flowToken,
            )
          ).status,
        ).toBe(401);
        await passwordLogin(); // removing the last passkey preserves password recovery
      },
    );

    it('requires user verification and recovers after verification becomes available', async () => {
      role = 'staff';
      await start('usb');
      await passwordLogin();
      await register();
      expect((await api('/auth/logout')).status).toBe(200);
      csrf = '';
      await cdp.send('WebAuthn.setUserVerified', {
        authenticatorId,
        isUserVerified: false,
      });
      const flow = await loginOptions();
      const attempt = await page.evaluate(async (json) => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 300);
        try {
          const credential = (await navigator.credentials.get({
            publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(json),
            signal: abort.signal,
          })) as PublicKeyCredential;
          return { response: credential.toJSON(), error: '' };
        } catch (cause) {
          return { response: null, error: (cause as Error).name };
        } finally {
          clearTimeout(timer);
        }
      }, flow.options);
      if (attempt.response)
        expect(
          (
            await api(
              '/auth/passkeys/login/verify',
              { flowId: flow.flowId, response: attempt.response },
              'POST',
              flow.flowToken,
            )
          ).status,
        ).toBe(401);
      else expect(['AbortError', 'NotAllowedError']).toContain(attempt.error);
      expect((await api('/auth/me', undefined, 'GET')).status).toBe(401);
      await cdp.send('WebAuthn.setUserVerified', {
        authenticatorId,
        isUserVerified: true,
      });
      await passkeyLogin();
    });

    it('handles cancellation without a session and resumes with a fresh ceremony', async () => {
      role = 'admin';
      await start('internal');
      const flow = await loginOptions();
      const error = await page.evaluate(async (json) => {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), 100);
        try {
          await navigator.credentials.get({
            publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(json),
            signal: abort.signal,
          });
          return 'unexpected-success';
        } catch (cause) {
          return (cause as Error).name;
        } finally {
          clearTimeout(timer);
        }
      }, flow.options);
      expect(['AbortError', 'NotAllowedError']).toContain(error);
      expect((await api('/auth/me', undefined, 'GET')).status).toBe(401);
      await passwordLogin();
      await register();
      expect((await api('/auth/logout')).status).toBe(200);
      csrf = '';
      await passkeyLogin();
    });
  });
}
