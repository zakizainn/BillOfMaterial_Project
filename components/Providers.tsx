// components/Providers.tsx

'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath="/bom-management/api/auth">
      {children}
    </SessionProvider>
  );
}