import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

export function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/80 dark:bg-muted/50",
        shimmer ? "shimmer-effect" : "animate-pulse",
        className
      )}
      {...props}
    />
  );
}

