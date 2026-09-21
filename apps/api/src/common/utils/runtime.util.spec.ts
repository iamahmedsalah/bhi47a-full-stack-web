import {
  isServerlessRuntime,
  shouldRunQueueWorkers,
  shouldRunStartupTasks,
} from './runtime.util';

describe('runtime utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.QUEUE_WORKERS_ENABLED;
    delete process.env.RUN_STARTUP_TASKS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('detects Vercel as a serverless runtime', () => {
    process.env.VERCEL = '1';

    expect(isServerlessRuntime()).toBe(true);
  });

  it('disables persistent workers and startup tasks by default on Vercel', () => {
    process.env.VERCEL = 'true';

    expect(shouldRunQueueWorkers()).toBe(false);
    expect(shouldRunStartupTasks()).toBe(false);
  });

  it('allows explicit overrides', () => {
    process.env.VERCEL = '1';
    process.env.QUEUE_WORKERS_ENABLED = 'true';
    process.env.RUN_STARTUP_TASKS = 'true';

    expect(shouldRunQueueWorkers()).toBe(true);
    expect(shouldRunStartupTasks()).toBe(true);
  });
});
