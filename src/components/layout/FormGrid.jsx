import { cn } from '@/lib/utils';

export default function FormGrid({ children, className }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5', className)}>
      {children}
    </div>
  );
}