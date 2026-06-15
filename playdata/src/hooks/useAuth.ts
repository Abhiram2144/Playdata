import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { AppUser } from '@/types';

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  useEffect(() => {
    const supabase = createClient();

    const fetchProfile = async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      return data as AppUser | null;
    };

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const profile = user ? await fetchProfile(user.id) : null;
      setState({ user, profile, loading: false });
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      const profile = user ? await fetchProfile(user.id) : null;
      setState({ user, profile, loading: false });
    });

    return () => subscription.unsubscribe();
  }, []);

  return state;
}
