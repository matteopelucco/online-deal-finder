import { cn } from '@/lib/utils'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-green-600 hover:bg-green-500 text-white border-transparent',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-transparent',
  danger: 'bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-800/50',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-gray-200 border-transparent',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors border focus:outline-none focus:ring-2 focus:ring-green-500/50',
          variants[variant],
          sizes[size],
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
