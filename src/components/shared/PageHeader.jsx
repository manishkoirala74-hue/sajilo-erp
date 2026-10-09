import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function PageHeader({ title, subtitle, action, actionLabel, actionIcon: Icon, actionDisabled, disabledReason, children }) {
  const ButtonEl = (
    <Button onClick={action} disabled={actionDisabled} className="flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4" />}
      {actionLabel}
    </Button>
  );

  return (
    <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
      <div>
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
        {action && (
          actionDisabled ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} role="button" aria-disabled="true" className="inline-block cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
                    {ButtonEl}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{disabledReason || "Action disabled."}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : ButtonEl
        )}
      </div>
    </div>
  );
}