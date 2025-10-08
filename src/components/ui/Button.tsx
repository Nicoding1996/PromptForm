import { motion, type HTMLMotionProps } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

type ButtonProps = HTMLMotionProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: LucideIcon;
};

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  // Use CSS variables so parent containers can set the brand color dynamically.
  // Fallbacks preserve existing Indigo styling if no variable is provided.
  primary: 'text-white shadow-sm bg-[var(--pf-brand,#4F46E5)] hover:bg-[var(--pf-brand-hover,#4338CA)]',
  secondary: 'bg-transparent text-neutral-700 border border-neutral-300 hover:bg-neutral-100',
  danger: 'bg-transparent text-danger-700 border border-danger-300 hover:bg-neutral-100',
};

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  icon: Icon,
  className,
  disabled,
  children,
  style,
  ...rest
}: ButtonProps & { style?: React.CSSProperties }) {
  // Inline styles ensure immediate reflection when --pf-brand changes at runtime.
  const inlineStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          backgroundColor: 'var(--pf-brand, #4F46E5)',
          // Preserve consumer-provided styles
          ...(style || {}),
        }
      : style || {};

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.05 }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--pf-brand,#4F46E5)] focus:ring-offset-0 disabled:opacity-60 disabled:cursor-not-allowed',
        variantClasses[variant],
        className
      )}
      style={inlineStyle}
      disabled={disabled}
      {...rest}
    >
      {Icon ? <Icon className="h-4 w-4" /> : null}
      <motion.span>{children}</motion.span>
    </motion.button>
  );
}

export default Button;