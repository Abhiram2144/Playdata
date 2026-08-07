import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BadgeCardProps {
  icon: LucideIcon
  name: string
  description?: string | null
  rarity: 'common' | 'rare' | 'legendary'
  className?: string
}

const rarityStyles: Record<BadgeCardProps['rarity'], { card: string; icon: string; pill: string; glow: string }> = {
  common: {
    card: 'border-slate-200 bg-white text-slate-900',
    icon: 'bg-slate-100 text-slate-500 ring-slate-200',
    pill: 'bg-slate-100 text-slate-500',
    glow: 'rgba(241,245,249,0.7)',
  },
  rare: {
    card: 'border-indigo-200 bg-indigo-50/80 text-slate-900',
    icon: 'bg-indigo-100 text-indigo-600 ring-indigo-200',
    pill: 'bg-indigo-100 text-indigo-700',
    glow: 'rgba(224,231,255,0.8)',
  },
  legendary: {
    card: 'border-amber-300 bg-amber-50 text-slate-900',
    icon: 'bg-amber-200 text-amber-700 ring-amber-300',
    pill: 'bg-amber-200 text-amber-800',
    glow: 'rgba(252,211,77,0.6)',
  },
}

export function BadgeCard({ icon: Icon, name, description, rarity, className }: BadgeCardProps) {
  const style = rarityStyles[rarity]

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('relative overflow-hidden rounded-2xl border p-4 shadow-sm', style.card, className)}
    >
      <div className="absolute inset-0 opacity-60" style={{ backgroundColor: style.glow }} />
      <div className="relative flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1', style.icon)}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{name}</p>
              {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
            </div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.pill)}>
              {rarity}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  )
}