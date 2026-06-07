import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'high' | 'mid' | 'low' | 'active' | 'inactive'
}

const variants = {
  default: 'bg-gray-800 text-gray-300 border-gray-700',
  high: 'bg-green-500/20 text-green-400 border-green-500/30',
  mid: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  low: 'bg-red-500/20 text-red-400 border-red-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  inactive: 'bg-gray-700/50 text-gray-500 border-gray-600/30',
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export function scoreVariant(score: number): BadgeProps['variant'] {
  if (score >= 8) return 'high'
  if (score >= 5) return 'mid'
  return 'low'
}

export { Badge }
