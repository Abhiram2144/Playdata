import { GetServerSideProps } from 'next';

// /login → /loginpage (canonical login page)
export const getServerSideProps: GetServerSideProps = async (context) => {
  const redirectTo = context.query.redirectTo as string | undefined;
  const error = context.query.error as string | undefined;
  const params = new URLSearchParams();
  if (redirectTo) params.set('redirectTo', redirectTo);
  if (error) params.set('error', error);
  const dest = `/loginpage${params.toString() ? `?${params}` : ''}`;
  return { redirect: { destination: dest, permanent: false } };
};

export default function LoginRedirect() { return null; }
