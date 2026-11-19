import { Badge } from '@shared/ui'
import type { AvailabilityBadgeViewModel } from '../model/view-model'

export function ChallengeAvailabilityBadge({ viewModel }: { viewModel: AvailabilityBadgeViewModel }) {
  return <Badge tone={viewModel.tone}>{viewModel.label}</Badge>
}
