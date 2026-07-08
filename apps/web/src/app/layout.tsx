import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "بوابة المعهد | Student Portal",
  description: "بوابة الطالب الإلكترونية - Student Portal for Institute Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
