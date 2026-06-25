import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-xl border border-transparent bg-stone-100/80 px-3 py-2 text-base transition-all duration-200 placeholder:text-stone-400 hover:bg-stone-200/50 focus-visible:outline-none focus-visible:bg-white focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
