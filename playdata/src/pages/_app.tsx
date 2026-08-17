import '@/styles/globals.css';
import type { ReactElement, ReactNode } from 'react';
import type { NextPage } from 'next';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { AdminProvider } from '@/contexts/AdminContext';

export type NextPageWithLayout<P = object, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const ToasterClient = dynamic(() => import('@/components/ToasterClient'), { ssr: false });

// Keeps a persistent personal socket room open for logged-in students so they
// receive session:invite push events from classroom-linked sessions.
const StudentInviteListener = dynamic(
  () => import('@/components/StudentInviteListener').then((m) => m.StudentInviteListener),
  { ssr: false }
);

const AccessibilityWidget = dynamic(() => import('@/components/AccessibilityWidget'), {
  ssr: false,
});

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? ((page) => page);
  return (
    <AdminProvider>
      {getLayout(<Component {...pageProps} />)}
      <ToasterClient />
      <StudentInviteListener />
      <AccessibilityWidget />
    </AdminProvider>
  );
}
