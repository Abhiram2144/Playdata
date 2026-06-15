import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/teacher/dashboard', permanent: false },
});

export default function TeacherIndex() { return null; }
