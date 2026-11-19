import { ActionLink, Card, KeyValueGrid, Stack, Text } from '@shared/ui'
import type { ChallengeCardViewModel } from '../model/view-model'
import { ChallengeAvailabilityBadge } from './availability-badge'

export function ChallengeCard({ viewModel }: { viewModel: ChallengeCardViewModel }) {
  return (
    <ActionLink href={viewModel.href} variant="block">
      <Card as="article" interactive className="h-full">
        <Stack gap="sm">
          <Stack direction="row" align="between" gap="sm">
            <Text as="span" variant="caption" tone="muted" className="font-semibold uppercase tracking-wide">
              {viewModel.gameLabel}
            </Text>
            <ChallengeAvailabilityBadge viewModel={viewModel.availability} />
          </Stack>
          <Text as="h2" variant="title">{viewModel.title}</Text>
        </Stack>
        <KeyValueGrid items={viewModel.facts} />
        <Stack gap="xs">
          {viewModel.schedule.map((line) => <Text key={line} tone="muted">{line}</Text>)}
          <Text tone="muted">{viewModel.capacity}</Text>
          <Text tone="muted">{viewModel.minimum}</Text>
        </Stack>
        <Text as="span" className="mt-auto font-semibold underline underline-offset-4">{viewModel.cta}</Text>
      </Card>
    </ActionLink>
  )
}
