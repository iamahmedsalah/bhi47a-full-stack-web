const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  return TRUE_VALUES.has(normalized);
}

export function isServerlessRuntime(): boolean {
  return (
    readBoolean(process.env.VERCEL) === true ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}

export function shouldRunQueueWorkers(): boolean {
  const configured = readBoolean(process.env.QUEUE_WORKERS_ENABLED);
  return configured ?? !isServerlessRuntime();
}

export function shouldRunStartupTasks(): boolean {
  const configured = readBoolean(process.env.RUN_STARTUP_TASKS);
  return configured ?? !isServerlessRuntime();
}
