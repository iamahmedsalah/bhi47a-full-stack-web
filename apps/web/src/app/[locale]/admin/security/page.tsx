import { PasskeyManager } from "@/components/auth/passkey-manager";
import { SessionManager } from '@/components/auth/session-manager';
import { PasskeySettings } from '@/components/auth/passkey-settings';

export default function AccountSecurityPage() {
  return <div className="space-y-6"><PasskeySettings /><SessionManager /><PasskeyManager /></div>;
}
