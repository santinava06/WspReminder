import type { Group } from './GroupList'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

type PendingSendConfirmation = {
  destinationGroups: Group[]
  reminderMessage: string
  title: string
  hasMedia?: boolean
  mediaPreview?: string | null
  mediaName?: string | null
}

type SendConfirmationModalProps = {
  pendingConfirmation: PendingSendConfirmation | null
  delaySeconds: number
  estimatedLabel: string
  sendState: LoadState
  primaryButton: string
  secondaryButton: string
  onCancel: () => void
  onConfirm: () => void
}

export default function SendConfirmationModal({
  pendingConfirmation,
  delaySeconds,
  estimatedLabel,
  sendState,
  primaryButton,
  secondaryButton,
  onCancel,
  onConfirm,
}: SendConfirmationModalProps) {
  if (!pendingConfirmation) return null

  return (
    <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 py-6 backdrop-blur-md" onClick={onCancel}>
      <section
        className="modal-surface surface-panel max-h-[calc(100vh-3rem)] w-full max-w-xl overflow-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <p className="section-kicker">Confirmacion</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950" id="send-confirm-title">{pendingConfirmation.title}</h2>
        </div>

        <div className="grid gap-4 p-5">
          <div className="surface-card grid grid-cols-3 gap-2 bg-slate-50 p-3 text-center">
            <div>
              <span className="block text-xs text-slate-500">Grupos</span>
              <strong className="text-lg text-slate-950">{pendingConfirmation.destinationGroups.length}</strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Pausa</span>
              <strong className="text-lg text-slate-950">{delaySeconds}s</strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Estimado</span>
              <strong className="text-lg text-slate-950">{estimatedLabel}</strong>
            </div>
          </div>

          <div className="surface-card bg-white p-4">
            <p className="section-kicker">Mensaje</p>
            <p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {pendingConfirmation.reminderMessage}
            </p>
            {pendingConfirmation.mediaPreview && (
              <div className="surface-card mt-3 bg-slate-50 p-2">
                <p className="mb-1.5 text-xs font-medium text-slate-500">Con foto adjunta</p>
                <img
                  className="max-h-28 rounded-md object-contain"
                  src={pendingConfirmation.mediaPreview}
                  alt={pendingConfirmation.mediaName || 'Foto'}
                />
                {pendingConfirmation.mediaName && (
                  <p className="mt-1 text-xs text-slate-500">{pendingConfirmation.mediaName}</p>
                )}
              </div>
            )}
          </div>

          <div className="surface-card overflow-hidden bg-white">
            <div className="border-b !border-slate-200/70 px-4 py-3 text-sm font-semibold text-slate-950">
              Primeros destinos
            </div>
            <div className="scroll-area max-h-40 overflow-auto">
              {pendingConfirmation.destinationGroups.slice(0, 8).map((group) => (
                <div className="border-b border-slate-100 px-4 py-2 text-sm text-slate-700 last:border-b-0" key={group.id}>
                  {group.name}
                </div>
              ))}
              {pendingConfirmation.destinationGroups.length > 8 && (
                <div className="px-4 py-2 text-sm font-medium text-slate-500">
                  +{pendingConfirmation.destinationGroups.length - 8} grupos mas
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-2 border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4 sm:grid-cols-2">
          <button className={secondaryButton} type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className={primaryButton} type="button" onClick={onConfirm} disabled={sendState === 'loading'}>
            Enviar a {pendingConfirmation.destinationGroups.length}
          </button>
        </div>
      </section>
    </div>
  )
}
