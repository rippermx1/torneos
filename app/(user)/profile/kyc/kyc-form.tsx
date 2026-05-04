'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isValidRut, type KycDocumentType } from '@/lib/identity/verification'

interface KycFormValues {
  rut: string
  birth_date: string
  phone: string
  city: string
  full_name: string
  document_type: KycDocumentType
  document_number: string
  document_front_path: string
  document_back_path: string
  bank_account_holder: string
  bank_account_rut: string
}

interface Props {
  defaults: KycFormValues
}

const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

const DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  cedula_chilena: 'Cédula chilena',
  passport: 'Pasaporte',
  other: 'Otro documento oficial',
}

export function KycForm({ defaults }: Props) {
  const [form, setForm] = useState<KycFormValues>(defaults)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [maxBirthDate] = useState(
    () => new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().split('T')[0]!
  )

  function setText(field: keyof Omit<KycFormValues, 'document_type'>) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function setDocumentType(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, document_type: e.target.value as KycDocumentType }))
  }

  function setDocumentFile(kind: 'front' | 'back') {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null
      if (!file) {
        if (kind === 'front') setFrontFile(null)
        else setBackFile(null)
        return
      }

      const validationError = validateDocumentFile(file)
      if (validationError) {
        setError(validationError)
        e.target.value = ''
        return
      }

      setError(null)
      if (kind === 'front') setFrontFile(file)
      else setBackFile(file)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.rut.trim()) { setError('El RUT es obligatorio.'); return }
    if (!isValidRut(form.rut)) { setError('El RUT no es válido.'); return }
    if (!form.full_name.trim()) { setError('El nombre completo es obligatorio.'); return }
    if (!form.birth_date) { setError('La fecha de nacimiento es obligatoria.'); return }
    if (!form.phone.trim()) { setError('El teléfono es obligatorio.'); return }
    if (!form.city.trim()) { setError('La ciudad es obligatoria.'); return }
    if (!form.document_number.trim()) { setError('El número de documento es obligatorio.'); return }
    if (!frontFile && !form.document_front_path) {
      setError('Debes cargar el frente del documento.')
      return
    }
    if (form.document_type === 'cedula_chilena' && !backFile && !form.document_back_path) {
      setError('Debes cargar el reverso de la cédula chilena.')
      return
    }
    if (!form.bank_account_holder.trim()) {
      setError('El titular bancario es obligatorio.')
      return
    }
    if (!form.bank_account_rut.trim()) {
      setError('El RUT del titular bancario es obligatorio.')
      return
    }
    if (!isValidRut(form.bank_account_rut)) {
      setError('El RUT del titular bancario no es válido.')
      return
    }

    startTransition(async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          setError('Sesión expirada. Inicia sesión nuevamente.')
          return
        }

        const documentFrontPath = frontFile
          ? await uploadDocument(supabase, user.id, 'front', frontFile)
          : form.document_front_path

        const documentBackPath = backFile
          ? await uploadDocument(supabase, user.id, 'back', backFile)
          : form.document_back_path

        const res = await fetch('/api/profile/kyc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            document_front_path: documentFrontPath,
            document_back_path: documentBackPath || null,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Error al enviar. Intenta de nuevo.')
          return
        }
        setSuccess(true)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error al enviar. Intenta de nuevo.'
        setError(message)
      }
    })
  }

  if (success) {
    return (
      <div className="border rounded-xl p-6 text-center space-y-2">
        <p className="font-semibold">Datos enviados</p>
        <p className="text-sm text-muted-foreground">
          El equipo revisará tu identidad, documentos y titularidad bancaria en 1-2 días hábiles.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset className="border rounded-xl p-4 space-y-4">
        <legend className="text-sm font-medium px-1">Identidad</legend>

        <Field label="Nombre completo *" htmlFor="full_name">
          <input
            id="full_name"
            type="text"
            value={form.full_name}
            onChange={setText('full_name')}
            placeholder="Como aparece en tu documento"
            required
            className={INPUT_CLS}
          />
        </Field>

        <Field label="RUT *" htmlFor="rut">
          <input
            id="rut"
            type="text"
            value={form.rut}
            onChange={setText('rut')}
            placeholder="12.345.678-5"
            required
            className={INPUT_CLS}
          />
          <p className="text-xs text-muted-foreground">Debe coincidir con el titular bancario.</p>
        </Field>

        <Field label="Fecha de nacimiento *" htmlFor="birth_date">
          <input
            id="birth_date"
            type="date"
            value={form.birth_date}
            onChange={setText('birth_date')}
            required
            max={maxBirthDate}
            className={INPUT_CLS}
          />
          <p className="text-xs text-muted-foreground">Debes ser mayor de 18 años.</p>
        </Field>

        <Field label="Teléfono *" htmlFor="phone">
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={setText('phone')}
            placeholder="+56 9 1234 5678"
            required
            className={INPUT_CLS}
          />
        </Field>

        <Field label="Ciudad *" htmlFor="city">
          <input
            id="city"
            type="text"
            value={form.city}
            onChange={setText('city')}
            placeholder="Santiago, Valparaíso, Concepción..."
            required
            className={INPUT_CLS}
          />
        </Field>
      </fieldset>

      <fieldset className="border rounded-xl p-4 space-y-4">
        <legend className="text-sm font-medium px-1">Documento</legend>

        <Field label="Tipo de documento *" htmlFor="document_type">
          <select
            id="document_type"
            value={form.document_type}
            onChange={setDocumentType}
            required
            className={INPUT_CLS}
          >
            {Object.entries(DOCUMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>

        <Field label="Número de documento *" htmlFor="document_number">
          <input
            id="document_number"
            type="text"
            value={form.document_number}
            onChange={setText('document_number')}
            placeholder="Número o serie del documento"
            required
            className={INPUT_CLS}
          />
        </Field>

        <Field label="Frente del documento *" htmlFor="document_front_file">
          <input
            id="document_front_file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={setDocumentFile('front')}
            required={!form.document_front_path}
            className={FILE_INPUT_CLS}
          />
          {form.document_front_path && !frontFile && (
            <p className="text-xs text-muted-foreground">Ya existe un documento frontal cargado.</p>
          )}
        </Field>

        <Field label={form.document_type === 'cedula_chilena' ? 'Reverso del documento *' : 'Reverso del documento'} htmlFor="document_back_file">
          <input
            id="document_back_file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={setDocumentFile('back')}
            required={form.document_type === 'cedula_chilena' && !form.document_back_path}
            className={FILE_INPUT_CLS}
          />
          {form.document_back_path && !backFile && (
            <p className="text-xs text-muted-foreground">Ya existe un reverso cargado.</p>
          )}
        </Field>
      </fieldset>

      <fieldset className="border rounded-xl p-4 space-y-4">
        <legend className="text-sm font-medium px-1">Titularidad bancaria</legend>

        <Field label="Titular de la cuenta *" htmlFor="bank_account_holder">
          <input
            id="bank_account_holder"
            type="text"
            value={form.bank_account_holder}
            onChange={setText('bank_account_holder')}
            placeholder="Debe coincidir con el nombre verificado"
            required
            className={INPUT_CLS}
          />
        </Field>

        <Field label="RUT del titular bancario *" htmlFor="bank_account_rut">
          <input
            id="bank_account_rut"
            type="text"
            value={form.bank_account_rut}
            onChange={setText('bank_account_rut')}
            placeholder="12.345.678-5"
            required
            className={INPUT_CLS}
          />
        </Field>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-foreground text-background py-3 rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Enviando...' : 'Enviar para verificación'}
      </button>
    </form>
  )
}

const INPUT_CLS =
  'w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20'

const FILE_INPUT_CLS =
  'w-full border rounded-xl px-3 py-2.5 text-sm bg-background file:mr-3 file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium focus:outline-none focus:ring-2 focus:ring-foreground/20'

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function validateDocumentFile(file: File): string | null {
  if (!DOCUMENT_ACCEPT.split(',').includes(file.type)) {
    return 'Formato no soportado. Usa JPG, PNG, WebP o PDF.'
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'El documento no puede superar 10 MB.'
  }
  return null
}

async function uploadDocument(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  kind: 'front' | 'back',
  file: File
): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const path = `${userId}/${Date.now()}-${kind}.${extension}`

  const { error } = await supabase.storage
    .from('kyc-documents')
    .upload(path, file, { cacheControl: '3600', upsert: false })

  if (error) {
    throw new Error(`No se pudo cargar el documento: ${error.message}`)
  }

  return path
}
