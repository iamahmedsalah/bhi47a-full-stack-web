/** Existing production data must never be changed by a seed command. */
export function validateSeedMode(nodeEnv: string | undefined, args: string[]) {
  if (nodeEnv === 'production') {
    throw new Error(
      'All production seeding is disabled; use the existing Atlas database',
    );
  }
  const adminOnly = args.includes('--admin-only');
  if (adminOnly && args.includes('--reset')) {
    throw new Error('Admin bootstrap cannot reset the database');
  }
  return adminOnly;
}
