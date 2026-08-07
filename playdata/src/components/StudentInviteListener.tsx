import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { io as ioClient, type Socket } from 'socket.io-client';
import { AnimatePresence, motion } from 'framer-motion';
import { X, GraduationCap, ArrowRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export interface InvitePayload {
  sessionId: string;
  sessionTitle: string;
  teacherName: string;
  classroomName: string;
  joinCode: string;
}

const BC_CHANNEL = 'playdata-sessions';

// Mounts once in _app and keeps a persistent personal socket room open
// for authenticated students. Renders an in-app modal on session:invite.
export function StudentInviteListener() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const studentIdRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [invite, setInvite] = useState<InvitePayload | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bc = new BroadcastChannel(BC_CHANNEL);
    channelRef.current = bc;

    bc.onmessage = (evt: MessageEvent) => {
      // Another tab joined — dismiss our modal without navigating
      if (evt.data?.type === 'session-joined') setInvite(null);
    };

    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'student' || cancelled) return;

      studentIdRef.current = user.id;

      await fetch('/api/socket');
      if (cancelled) return;

      const socket = ioClient({ path: '/api/socket', transports: ['websocket', 'polling'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('join-personal', user.id);
      });

      socket.on('session:invite', (payload: InvitePayload) => {
        if (cancelled) return;
        setInvite(payload);
        // Notify classroom detail pages so they can update their active-session banner
        bc.postMessage({ type: 'session-started', payload });
      });
    }

    init().catch(console.error);

    return () => {
      cancelled = true;
      bc.close();
      channelRef.current = null;
      const socket = socketRef.current;
      const studentId = studentIdRef.current;
      if (socket) {
        if (studentId) socket.emit('leave-personal', studentId);
        socket.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleJoin() {
    if (!invite || joining) return;
    setJoining(true);
    try {
      await fetch('/api/student/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: invite.joinCode }),
      });
    } catch {
      // proceed to session even if join request fails
    }
    channelRef.current?.postMessage({ type: 'session-joined' });
    const sid = invite.sessionId;
    setInvite(null);
    setJoining(false);
    router.push(`/student/sessions/${sid}`);
  }

  function handleDismiss() {
    setInvite(null);
  }

  return (
    <AnimatePresence>
      {invite && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={handleDismiss}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden pointer-events-auto">
              <div className="h-1.5 bg-gradient-to-r from-violet-600 to-indigo-500" />

              <div className="p-6">
                <button
                  onClick={handleDismiss}
                  className="absolute right-4 top-5 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  <X className="size-4" />
                </button>

                <div className="flex items-center gap-2 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 ring-1 ring-violet-200">
                    <GraduationCap className="size-5 text-violet-600" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-violet-600">
                    Session Starting
                  </span>
                </div>

                <h2 className="text-lg font-bold text-gray-900 mb-1 pr-6">{invite.sessionTitle}</h2>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{invite.teacherName}</span>
                  {' · '}
                  {invite.classroomName}
                </p>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={handleDismiss}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {joining ? (
                      <><Loader2 className="size-4 animate-spin" /> Joining…</>
                    ) : (
                      <>Join now <ArrowRight className="size-4" /></>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
