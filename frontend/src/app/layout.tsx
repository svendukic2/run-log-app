import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Decode Academy Demo',
  description: 'Next.js frontend for the Decode Academy Demo teaching repo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
