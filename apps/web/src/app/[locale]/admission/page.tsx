import type { Metadata } from 'next';
import { PublicAdmissionPage } from '@/features/admissions/public-admission-page';
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function AdmissionPage() { return <PublicAdmissionPage />; }
