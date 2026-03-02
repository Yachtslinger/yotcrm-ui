import { Skeleton } from "./Skeleton";

export function LeadsTableSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden animate-in fade-in duration-200">
      {/* Header row */}
      <div className="hidden md:flex items-center gap-4 px-4 py-3 border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/80">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
      {/* Rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100 dark:border-neutral-800 last:border-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44 md:hidden" />
            </div>
          </div>
          <Skeleton className="h-3.5 w-40 hidden md:block" />
          <Skeleton className="h-3.5 w-48 hidden md:block" />
          <Skeleton className="h-6 w-16 rounded-full hidden md:block" />
          <Skeleton className="h-3.5 w-20 hidden md:block" />
        </div>
      ))}
    </div>
  );
}
