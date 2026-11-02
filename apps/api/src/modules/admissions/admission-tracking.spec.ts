import { ConfigService } from '@nestjs/config';
import { AdmissionSecurity, admissionHash } from './admission-security.service';
import { AdmissionWorkflowService } from './admission-workflow.service';

describe('Admission tracking retries across receipt formats', () => {
  const security = new AdmissionSecurity(
    new ConfigService({
      NODE_ENV: 'test',
      ADMISSIONS_HMAC_KEY: 'synthetic-unit-test-key-at-least-32-bytes',
      ADMISSIONS_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
    }),
  );
  const access = '100000000000000000000001';
  const submissionKey = 'a'.repeat(32);
  const input = () => ({
    fullName: 'Synthetic applicant',
    address: 'Synthetic address',
    nationalId: '30001010100001',
    phone: '01012345678',
    guardians: [
      {
        name: 'Synthetic guardian',
        phone: '01112345678',
        relationship: 'Parent',
      },
    ],
    studentType: 'NEW' as const,
    admissionSession: security.session(access),
    submissionKey,
    captchaToken: 'already-used-token',
  });
  function fixture(
    receipt: { publicReference: string; secret: string },
    correctSecret = true,
  ) {
    // Exercise the real submission method; persistence is the only fixture.
    const service = Object.create(
      AdmissionWorkflowService.prototype,
    ) as AdmissionWorkflowService;
    const query = {
      select: jest.fn().mockReturnThis(),
      session: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({
        publicReference: receipt.publicReference,
        statusSecretHash: admissionHash(
          correctSecret ? receipt.secret : 'different-secret',
        ),
      }),
    };
    const findOne = jest.fn().mockReturnValue(query);
    Object.assign(service, { security, requests: { findOne } });
    return { service, findOne };
  }
  it.each([false, true])(
    'returns the original receipt for a retry, including legacy=%s',
    async (legacy) => {
      const receipt = security.receipt(access, submissionKey, legacy);
      const { service, findOne } = fixture(receipt);
      const captcha = jest.spyOn(security, 'captcha');
      try {
        expect(await service.submit(input())).toEqual(receipt);
        expect(findOne).toHaveBeenCalledTimes(1);
        expect(captcha).not.toHaveBeenCalled();
      } finally {
        captcha.mockRestore();
      }
    },
  );
  it('never treats a reference collision as a successful prior submission', async () => {
    const { service } = fixture(security.receipt(access, submissionKey), false);
    await expect(service.submit(input())).rejects.toMatchObject({
      status: 409,
    });
  });
});
