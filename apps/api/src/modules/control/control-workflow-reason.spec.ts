import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewSheetDto, UnlockSheetDto } from './dto/control.dto';

describe('Optional workbook open/close reasons', () => {
  it('allows unlocking and reopening without a reason or with an empty reason', async () => {
    for (const reason of [undefined, '', '   ']) {
      expect(
        await validate(plainToInstance(UnlockSheetDto, { reason })),
      ).toHaveLength(0);
      expect(
        await validate(
          plainToInstance(ReviewSheetDto, {
            action: 'REOPEN',
            expectedRevision: 2,
            reason,
          }),
        ),
      ).toHaveLength(0);
    }
  });
  it('retains validation for review decisions and malformed supplied reasons', async () => {
    for (const action of ['SUBMIT', 'APPROVE', 'RETURN']) {
      expect(
        await validate(
          plainToInstance(ReviewSheetDto, { action, expectedRevision: 2 }),
        ),
      ).not.toHaveLength(0);
    }
    for (const reason of [123, 'x'.repeat(501)]) {
      expect(
        await validate(plainToInstance(UnlockSheetDto, { reason })),
      ).not.toHaveLength(0);
      expect(
        await validate(
          plainToInstance(ReviewSheetDto, {
            action: 'REOPEN',
            expectedRevision: 2,
            reason,
          }),
        ),
      ).not.toHaveLength(0);
    }
  });
});
