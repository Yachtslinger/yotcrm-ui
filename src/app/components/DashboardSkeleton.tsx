import { Skeleton, SkeletonText } from "./Skeleton";

export function DashboardSkeleton() {
  return (
    <div className="px-4 py-5 md:px-8 md:py-8 max-w-[1200px] mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <Skeleton className="h-8 w-44 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Pipeline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 dark:border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="w-2.5 h-2.5 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-7 w-8" />
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Leads */}
        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="divide-y divide-gray-100 dark:divide-neutral-800">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-3 w-16 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Tasks */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-neutral-800">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-neutral-800">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-5 py-3 flex items-start gap-2">
                  <Skeleton className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" />
                  <SkeletonText lines={2} className="flex-1" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 shadow-sm p-5">
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
