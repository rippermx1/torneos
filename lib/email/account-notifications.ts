import { sendTemplateEmail, FROM_SYSTEM } from './client'

export async function sendWelcomeEmail({
  to,
  username,
}: {
  to: string
  username: string
}) {
  await sendTemplateEmail({
    to,
    templateId: '72bfcfe5-0f15-4328-a3a7-2aa1c297c1b9',
    from: FROM_SYSTEM,
    data: { username },
  })
}

export async function sendAccountBannedEmail({
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
    templateId: '9b712097-b56e-4390-ab29-795dc624e98e',
    from: FROM_SYSTEM,
    data: { username, reason: reason ?? '' },
  })
}
