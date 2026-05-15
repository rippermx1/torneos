import { sendEmail } from './client'

function formatCLPPesos(pesos: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(pesos)
}

/**
 * Notifica al usuario que su torneo fue cancelado y el reembolso fue iniciado.
 * Se llama al emitir cada reversa, por lo que incluye el monto individual.
 */
export async function sendTournamentCancelledEmail({
  to,
  username,
  tournamentName,
  amountPesos,
}: {
  to: string
  username: string
  tournamentName: string
  amountPesos: number
}) {
  const amount = formatCLPPesos(amountPesos)

  await sendEmail({
    to,
    subject: `Torneo cancelado — reembolso en proceso: ${tournamentName}`,
    text: [
      `Hola ${username},`,
      '',
      `El torneo "${tournamentName}" fue cancelado porque no alcanzó el mínimo de participantes.`,
      '',
      `Tu reembolso de ${amount} fue iniciado y llegará a tu cuenta Flow o banco registrado en los próximos 1-3 días hábiles.`,
      '',
      'Si tienes dudas, contáctanos respondiendo este correo.',
      '',
      'Equipo Torneos',
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <h2 style="margin-bottom:4px">Torneo cancelado</h2>
        <p style="color:#666;margin-top:0">${tournamentName}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p>Hola <strong>${username}</strong>,</p>
        <p>
          El torneo <strong>${tournamentName}</strong> fue cancelado porque no alcanzó
          el mínimo de participantes requerido.
        </p>
        <div style="background:#f5f5f5;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center">
          <p style="margin:0 0 4px;color:#666;font-size:13px">Reembolso iniciado</p>
          <p style="margin:0;font-size:28px;font-weight:700">${amount}</p>
          <p style="margin:4px 0 0;color:#666;font-size:12px">
            Llegará a tu cuenta Flow o banco en 1–3 días hábiles
          </p>
        </div>
        <p style="font-size:13px;color:#666">
          Si tienes dudas sobre el reembolso, contáctanos respondiendo este correo.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:12px;color:#999;margin:0">Equipo Torneos</p>
      </div>
    `,
  })
}

/**
 * Notifica al usuario que su reembolso fue acreditado exitosamente.
 * Se llama desde el webhook de Flow cuando el estado pasa a "completed".
 */
export async function sendRefundCompletedEmail({
  to,
  username,
  tournamentName,
  amountPesos,
}: {
  to: string
  username: string
  tournamentName: string
  amountPesos: number
}) {
  const amount = formatCLPPesos(amountPesos)

  await sendEmail({
    to,
    subject: `Reembolso acreditado — ${tournamentName}`,
    text: [
      `Hola ${username},`,
      '',
      `Tu reembolso de ${amount} por el torneo "${tournamentName}" fue acreditado exitosamente.`,
      '',
      'El monto ya está disponible en tu cuenta Flow o banco registrado.',
      '',
      'Equipo Torneos',
    ].join('\n'),
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
        <h2 style="margin-bottom:4px">✓ Reembolso acreditado</h2>
        <p style="color:#666;margin-top:0">${tournamentName}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p>Hola <strong>${username}</strong>,</p>
        <p>
          Tu reembolso por el torneo <strong>${tournamentName}</strong> fue
          <strong>acreditado exitosamente</strong>.
        </p>
        <div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;border:1px solid #bbf7d0">
          <p style="margin:0 0 4px;color:#166534;font-size:13px">Monto acreditado</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#166534">${amount}</p>
          <p style="margin:4px 0 0;color:#166534;font-size:12px">
            Ya disponible en tu cuenta Flow o banco
          </p>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="font-size:12px;color:#999;margin:0">Equipo Torneos</p>
      </div>
    `,
  })
}
