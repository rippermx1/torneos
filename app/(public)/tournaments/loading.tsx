export default function TournamentsLoading() {
  return (
    <div className="space-y-6 max-w-2xl animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-5 w-2/3 bg-muted rounded" />
                <div className="h-4 w-1/3 bg-muted rounded" />
              </div>
              <div className="h-6 w-16 bg-muted rounded-full" />
            </div>
            <div className="flex gap-4">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
