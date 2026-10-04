import type { ReactNode } from 'react';
import { Providers } from './providers';

export const metadata = {
  title: 'StellarAgent React SSR example',
  description: 'Minimal Next.js App Router example for @stellaragent/react',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
