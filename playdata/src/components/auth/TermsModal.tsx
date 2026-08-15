import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
  onAgree?: () => void;
}

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Who we are',
    body: [
      'PlayData is an educational data-literacy platform that turns real datasets into interactive lessons, quizzes and live classroom sessions. For the purposes of the UK GDPR and the Data Protection Act 2018, the PlayData project team acts as the data controller for the personal data you provide when creating an account.',
    ],
  },
  {
    title: '2. What data we collect',
    body: [
      'Account data: your name, email address and role (student or teacher).',
      'Learning data: quiz answers, scores, streaks, badges, session participation and classroom membership.',
      'Content you create: datasets you upload, charts, quizzes and feedback you submit.',
      'Technical data strictly necessary to keep you signed in (authentication cookies). We do not use advertising or tracking cookies.',
    ],
  },
  {
    title: '3. Why we process it (lawful basis)',
    body: [
      'We process your data to provide the service you sign up for (performance of a contract — Art. 6(1)(b) UK GDPR): running live sessions, scoring quizzes, showing your results and progress to you and your teacher.',
      'Aggregated, class-level analytics and AI-generated summaries are processed under legitimate interest (Art. 6(1)(f)) to help teachers improve their lessons. These never single out individual students.',
      'We will never sell your personal data or use it for advertising.',
    ],
  },
  {
    title: '4. Automated features',
    body: [
      'Some features (quiz generation, answer explanations, class performance summaries) process question text and aggregated class statistics through trusted third-party data processors. These requests never include your name or email address.',
    ],
  },
  {
    title: '5. Where your data lives and how long we keep it',
    body: [
      'Your data is stored securely with our hosting provider (Supabase) and protected by role-based access controls — students can only see their own results; teachers can only see data for their own classrooms.',
      'We keep your data for as long as your account is active. If you delete your account, or your organisation leaves PlayData, your personal data is deleted within 30 days.',
    ],
  },
  {
    title: '6. Your rights',
    body: [
      'Under the UK GDPR you have the right to: access a copy of your data; rectify inaccurate data; erase your data ("right to be forgotten"); restrict or object to processing; and data portability.',
      'To exercise any of these rights, contact your organisation administrator or the PlayData team. If you are unhappy with how we handle your data you can complain to the Information Commissioner’s Office (ico.org.uk).',
    ],
  },
  {
    title: '7. Children’s data',
    body: [
      'PlayData is used in schools. Where users are under 13, the school or organisation is responsible for obtaining any necessary parental consent before creating accounts. We collect the minimum data needed to run the service.',
    ],
  },
  {
    title: '8. Changes to these terms',
    body: [
      'If we make material changes to these terms or to how we process your data, we will notify you in the app and ask you to review them again.',
    ],
  },
];

export function TermsModal({ open, onClose, onAgree }: TermsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#151526] shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 ring-1 ring-violet-500/30">
                  <ShieldCheck className="size-4 text-violet-400" />
                </div>
                <h2 id="terms-modal-title" className="text-base font-bold text-white">
                  Terms &amp; Conditions
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-[#8d8da0] transition-colors hover:bg-white/5 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <p className="text-xs text-[#8d8da0]">
                Please read how PlayData collects and uses your data, in line with the UK GDPR and
                the Data Protection Act 2018.
              </p>
              {SECTIONS.map((s) => (
                <section key={s.title} className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#c9c9d4]">{s.title}</h3>
                  {s.body.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-[#8d8da0]">{p}</p>
                  ))}
                </section>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/8 px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="text-[#8d8da0] hover:bg-white/5 hover:text-white"
              >
                Close
              </Button>
              {onAgree && (
                <Button
                  type="button"
                  onClick={onAgree}
                  className="bg-violet-600 text-white hover:bg-violet-700"
                >
                  I agree
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
