export interface KeyValueItem {
  id: string
  label: string
  value: string
}

export function KeyValueGrid({ items }: { items: ReadonlyArray<KeyValueItem> }) {
  return (
    <dl className="grid grid-cols-2 gap-ds-md rounded-ds-md bg-ds-surface-muted/40 p-ds-md">
      {items.map((item) => (
        <div key={item.id}>
          <dt className="text-xs text-ds-text-muted">{item.label}</dt>
          <dd className="font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
