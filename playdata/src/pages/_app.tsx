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

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? ((page) => page);
  return (
    <AdminProvider>
      {getLayout(<Component {...pageProps} />)}
      <ToasterClient />
    </AdminProvider>
  );
}
