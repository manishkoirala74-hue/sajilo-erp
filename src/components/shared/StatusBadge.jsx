import { cn } from '@/lib/utils';

const statusStyles = {
  // Generic
  Draft: 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground',
  Active: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  Inactive: 'bg-slate-100 dark:bg-slate-500/20 text-slate-500',
  Cancelled: 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400',

  // Purchase / Sales Order
  'Pending Approval': 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  Approved: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  Billed: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  Confirmed: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  Preparing: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  Ready: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400',
  Dispatched: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  Delivered: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',

  // Invoice status
  Posted: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  Unpaid: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  Partial: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  Paid: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',

  // Partner
  true: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  false: 'bg-slate-100 dark:bg-slate-500/20 text-slate-500',
};

export default function StatusBadge({ status, className }) {
  const style = statusStyles[status] || 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground';
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      style,
      className
    )}>
      {status?.toString()}
    </span>
  );
}