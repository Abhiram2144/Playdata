import {
  GetServerSideProps,
  GetServerSidePropsContext,
  GetServerSidePropsResult,
} from 'next';
import { createClientFromContext } from '@/lib/supabase/server-props';
import { UserRole } from '@/types';

type AuthOptions = {
  allowedRoles?: UserRole[];
};

/**
 * Wraps getServerSideProps with auth + optional role guard.
 *
 * Usage:
 *   export const getServerSideProps = withAuth(
 *     async (ctx, userId, role) => ({ props: {} }),
 *     { allowedRoles: ['teacher'] }
 *   );
 */
export function withAuth<P extends Record<string, unknown>>(
  handler: (
    context: GetServerSidePropsContext,
    userId: string,
    role: UserRole
  ) => Promise<GetServerSidePropsResult<P>>,
  options: AuthOptions = {}
): GetServerSideProps<P> {
  return async (context) => {
    const supabase = createClientFromContext(context);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        redirect: {
          destination: `/login?redirectTo=${encodeURIComponent(context.resolvedUrl)}`,
          permanent: false,
        },
      };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role as UserRole) ?? 'student';

    if (options.allowedRoles && !options.allowedRoles.includes(role)) {
      return { redirect: { destination: '/unauthorized', permanent: false } };
    }

    return handler(context, user.id, role);
  };
}
