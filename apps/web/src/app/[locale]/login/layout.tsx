import { AuthProvider } from '@/providers/auth-provider';

export default async function LoginLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return <AuthProvider locale={locale}>{children}</AuthProvider>;
}
