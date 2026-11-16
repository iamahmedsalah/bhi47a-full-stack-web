import { GradesService } from './grades.service';

describe('bounded Control release preview', () => {
  it('previews at most four sheets concurrently and retains digest order', async () => {
    const sheets = Array.from({ length: 9 }, (_, index) => ({
      _id: String(index),
      courseCode: String(index),
      component: 'midterm',
    }));
    let active = 0;
    let peak = 0;
    const preview = jest.fn(async (sheet: (typeof sheets)[number]) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return { count: 1, activeReleaseId: null, digest: 'digest-' + sheet._id };
    });
    const service: GradesService = Object.assign(
      Object.create(GradesService.prototype) as GradesService,
      {
        controlSheetModel: {
          find: () => ({
            limit: () => ({ lean: () => Promise.resolve(sheets) }),
          }),
        },
      },
    );
    Object.defineProperty(service, 'controlReleases', { value: { preview } });
    const result = await service.previewControlRelease({ isPublished: true });
    expect(peak).toBe(4);
    expect(result.sheets.map((sheet) => sheet.sheetId)).toEqual(
      sheets.map((sheet) => sheet._id),
    );
    expect(result.releaseDigests['8']).toBe('digest-8');
    await service.previewControlRelease({ isPublished: false });
    expect(preview).toHaveBeenCalledTimes(9);
  });
});
