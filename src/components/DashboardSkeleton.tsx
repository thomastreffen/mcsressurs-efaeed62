import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="p-5 sm:p-8 space-y-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>

      {/* KPI cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card shadow-sm p-6 sm:p-8 space-y-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-16" />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <div className="rounded-2xl bg-card shadow-sm p-6 space-y-4">
            <Skeleton className="h-4 w-24" />
            <div className="flex justify-center">
              <Skeleton className="h-48 w-48 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-6">
          <div className="rounded-2xl bg-card shadow-sm p-6 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="col-span-12 lg:col-span-6">
          <div className="rounded-2xl bg-card shadow-sm p-6 space-y-3">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
