import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4">
      {/* Header */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-20 rounded-md" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div 
          key={rowIndex} 
          className="grid gap-4 animate-pulse" 
          style={{ 
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            animationDelay: `${rowIndex * 50}ms`
          }}
        >
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-10 rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-10 w-10 rounded-xl" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i} 
          className="animate-fade-in"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 rounded-lg" />
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div 
          key={i} 
          className="flex items-center gap-4 p-4 border border-border/50 rounded-xl animate-pulse"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-4 w-32 rounded-md" />
      </div>
      
      {/* Quick Actions */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      
      {/* Stats Grid */}
      <CardGridSkeleton count={4} />
      
      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, cardIndex) => (
          <Card 
            key={cardIndex} 
            className="animate-fade-in"
            style={{ animationDelay: `${(cardIndex + 4) * 100}ms` }}
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                  <Skeleton className="h-4 w-24 rounded-md" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AgendaSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>
      
      {/* Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-6 w-48 rounded-md" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-16 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="min-h-[400px] p-4">
            {/* Days Header */}
            <div className="grid grid-cols-8 gap-2 mb-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
            {/* Time Slots */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="grid grid-cols-8 gap-2 mb-2">
                {Array.from({ length: 8 }).map((_, j) => (
                  <Skeleton key={j} className="h-14 rounded-lg" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PatientListSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      
      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <TableSkeleton rows={8} cols={5} />
        </CardContent>
      </Card>
    </div>
  );
}

export function PageSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-6">
      {title && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>
      )}
      <Card>
        <CardContent className="pt-6">
          <FormSkeleton fields={6} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Fallback padrão para seções/abas carregadas sob demanda (lazy + Suspense).
 * Substitui spinners soltos por um esqueleto que já sugere o layout final.
 */
export function SectionFallback({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-fade-in" role="status" aria-label="Carregando conteúdo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-lg" />
          <Skeleton className="h-3 w-56 rounded-md" />
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <Card>
        <CardContent className="p-0">
          <TableSkeleton rows={rows} cols={4} />
        </CardContent>
      </Card>
    </div>
  );
}
