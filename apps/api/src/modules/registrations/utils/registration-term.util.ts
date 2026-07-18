export interface RegistrationTermWindow {
  isOpen: boolean;
  opensAt?: Date;
  closesAt?: Date;
}

export function isRegistrationTermCurrentlyOpen(
  term: RegistrationTermWindow | null | undefined,
  now = new Date(),
): boolean {
  return Boolean(
    term?.isOpen &&
    (!term.opensAt || now >= term.opensAt) &&
    (!term.closesAt || now <= term.closesAt),
  );
}
