export function operationalError(error: { code?: string; message: string }): Response {
  const status = /^PT(400|403|404|409|422|423|429)$/.test(error.code ?? '') ? Number(error.code!.slice(2)) : 503
  return Response.json({ error: status === 503 ? 'Resultado incierto. Recarga y consulta el estado del incidente o aviso antes de repetir.' : error.message }, { status })
}
