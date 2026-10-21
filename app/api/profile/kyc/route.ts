import { free2048IntakeDisabledResponse } from '@/lib/release/free-2048'

// Never parse identity data, initialize Auth/DB, upload a file or send a notification.
// This remains closed even when the handler is invoked without the proxy.
export function POST(): Response { return free2048IntakeDisabledResponse() }
export function GET(): Response { return free2048IntakeDisabledResponse() }
export function HEAD(): Response { return free2048IntakeDisabledResponse() }
export function PUT(): Response { return free2048IntakeDisabledResponse() }
export function PATCH(): Response { return free2048IntakeDisabledResponse() }
export function DELETE(): Response { return free2048IntakeDisabledResponse() }
export function OPTIONS(): Response { return free2048IntakeDisabledResponse() }
