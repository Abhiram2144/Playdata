import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/auth/login', permanent: true },
});

export default function LoginRedirect() { return null; }
