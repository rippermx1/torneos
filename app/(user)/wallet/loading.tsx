export default function WalletLoading() {
  return (
    <div className="space-y-6 max-w-lg animate-pulse">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-muted rounded-lg" />
          <div className="h-9 w-28 bg-muted rounded-lg" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-20 bg-muted rounded-xl" />
          <div className="h-10 w-24 bg-muted rounded-xl" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-5 w-20 bg-muted rounded" />
        <div className="border rounded-xl divide-y overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-3 w-24 bg-muted rounded" />
              </div>
              <div className="space-y-1.5 text-right">
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
