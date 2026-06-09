import { Button } from '@/components/ui/button';

export default function PageHeader({ title, subtitle, action, actionLabel, actionIcon: Icon }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <Button onClick={action} className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4" />}
          {actionLabel}
        </Button>
      )}
    </div>
  );
}