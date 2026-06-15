import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0d0d18] gap-4 text-center p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-950/50 ring-1 ring-red-800/60">
        <svg className="size-8 text-red-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-white">Access denied</h1>
      <p className="text-sm text-[#8d8da0]">You don&apos;t have permission to view this page.</p>
      <Link href="/" className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors">Go home</Link>
    </div>
  );
}
