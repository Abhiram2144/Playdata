import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/student/dashboard', permanent: false },
});

export default function StudentIndex() { return null; }
