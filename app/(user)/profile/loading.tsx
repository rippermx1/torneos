export default function ProfileLoading() {
  return (
    <div className="space-y-8 max-w-lg animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-24 bg-muted rounded-lg" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-32 bg-muted rounded" />
        <div className="border rounded-xl p-4 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 bg-muted rounded" />
              <div className="h-9 w-full bg-muted rounded-lg" />
            </div>
          ))}
          <div className="h-10 w-28 bg-muted rounded-xl" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-5 w-36 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-3 space-y-1.5">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
