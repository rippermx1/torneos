import { sendTemplateEmail } from './client'

export async function sendKycReceivedEmail({
  to,
  username,
}: {
  to: string
  username: string
}) {
  await sendTemplateEmail({
    to,
    templateId: '0325eeda-b89b-4f44-ab7f-56d34570c05e',
    data: { username },
  })
}

export async function sendKycApprovedEmail({
  to,
  username,
}: {
  to: string
  username: string
}) {
  await sendTemplateEmail({
    to,
    templateId: '330d853e-2671-444d-a7a7-35dc3ea152d6',
    data: { username },
  })
}

export async function sendKycRejectedEmail({
  to,
  username,
  reason,
}: {
  to: string
  username: string
  reason?: string | null
}) {
  await sendTemplateEmail({
    to,
    templateId: '5fcf50a2-c4b2-462b-993c-8447bdb102bf',
    data: { username, reason: reason ?? '' },
  })
}
