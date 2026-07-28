import { cn } from '@/lib/utils';

export default function FormRow({ children, fullWidth = false, className }) {
  return (
    <div className={cn(fullWidth ? 'md:col-span-full' : 'col-span-1', className)}>
      {children}
    </div>
  );
}