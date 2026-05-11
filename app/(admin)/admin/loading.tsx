export default function AdminLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded-lg" />
      <div className="h-4 w-80 bg-muted rounded" />
      <div className="grid gap-3 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-2xl p-5 space-y-2">
            <div className="h-4 w-56 bg-muted rounded" />
            <div className="h-3 w-40 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
