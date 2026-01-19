import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'browser-ai Next.js Example',
  description: 'Local AI in your browser',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
