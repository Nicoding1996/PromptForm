import React from 'react';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn('bg-white rounded-lg border border-neutral-200 shadow-md', className)}
      {...rest}
    >
      {children}
    </div>
  );
});

export default Card;