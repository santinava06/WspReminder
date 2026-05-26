import { Calendar, Image } from 'lucide-react'
import type { Group } from './GroupList'
import type { SendProgressResult } from '../hooks/useSendHistory'

type Props = {
  qrDataUrl: string | null
  destinationMode: string
  selectedLabel: string
  selectedCount: number
  groups: Group[]
  message: string
  selectedFile: File | null
  imagePreview: string | null
  mediaAttachment: unknown
  delaySeconds: number
  destinationCount: number
  estimatedLabel: string
  sendState: string
  sendFeedback: string
  sendResults: SendProgressResult[]
  progressTotal: number
  progressDone: number
  progressPercent: number
  currentSendIndex: number
  currentGroupName: string
  failedResultsCount: number
  canSend: boolean
  sessionConnected: boolean
  onDestinationModeChange: (mode: string) => void
  onSelectedGroupClear: () => void
  onMessageChange: (msg: string) => void
  onFileSelect: (file: File | null) => void
  onDelayChange: (sec: number) => void
  onRetryFailed: () => void
  onClearResults: () => void
  onSend: () => void
  onCancelSend: () => void
  onSchedule: () => void
  onToast: (msg: string, type: 'error' | 'success' | 'info') => void
  onSubmit: (e: React.FormEvent) => void
}

const primaryButton = 'inline-flex items-center justify-center gap-1.5 min-h-9 rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-[0.98] pressable disabled:opacity-40 disabled:cursor-not-allowed'
const secondaryButton = 'inline-flex items-center justify-center gap-1.5 min-h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] pressable disabled:opacity-40 disabled:cursor-not-allowed'
const dangerButton = 'inline-flex items-center justify-center gap-1.5 min-h-9 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 active:scale-[0.98] pressable disabled:opacity-40 disabled:cursor-not-allowed'
const panelClass = 'rounded-2xl border border-slate-100/80 bg-white/70 shadow-[0_1px_3px_-1px_rgba(0,0,0,0.04)] backdrop-blur-xl'

export default function SendPanel(props: Props) {
  const {
    qrDataUrl, destinationMode, selectedLabel, selectedCount, groups,
    message, selectedFile, imagePreview, mediaAttachment,
    delaySeconds, destinationCount, estimatedLabel,
    sendState, sendFeedback, sendResults,
    progressTotal, progressDone, progressPercent,
    currentSendIndex, currentGroupName, failedResultsCount,
    canSend, sessionConnected,
    onDestinationModeChange, onSelectedGroupClear, onMessageChange,
    onFileSelect, onDelayChange,
    onRetryFailed, onClearResults, onSend, onCancelSend,
    onSchedule, onToast, onSubmit,
  } = props

  return (
    <aside className={`${panelClass} grid min-h-[36rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0`}>
      <div className="border-b !border-slate-200/70 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="section-kicker">Composer</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Mensaje</h2>
          </div>
          <span className="status-pill min-h-0 px-3 py-1 text-xs">
            {destinationMode === 'all'
              ? 'Masivo'
              : destinationMode === 'selected'
                ? 'Multiple'
                : 'Individual'}
          </span>
        </div>
      </div>

      <div className="scroll-area min-h-0 overflow-auto px-5 py-4">
        {qrDataUrl && (
          <section className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <img className="mx-auto h-44 w-44 rounded-lg bg-white p-2 shadow-sm" src={qrDataUrl} alt="QR de WhatsApp para iniciar sesion" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">Vincular WhatsApp</h3>
            <p className="mt-1 text-sm text-slate-600">Escanea el codigo desde dispositivos vinculados.</p>
          </section>
        )}

        <div className="surface-card bg-slate-50 p-4">
          <p className="section-kicker">Destino</p>
          <strong className="mt-1 block text-base text-slate-950">{selectedLabel}</strong>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <button
              className={`rounded-md px-2 py-2 text-xs font-medium transition ${destinationMode === 'single' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
              type="button"
              onClick={() => onDestinationModeChange('single')}
            >
              Uno
            </button>
            <button
              className={`rounded-md px-2 py-2 text-xs font-medium transition disabled:opacity-40 ${destinationMode === 'selected' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
              type="button"
              disabled={selectedCount === 0}
              onClick={() => { onDestinationModeChange('selected'); onSelectedGroupClear() }}
            >
              Seleccion
            </button>
            <button
              className={`rounded-md px-2 py-2 text-xs font-medium transition disabled:opacity-40 ${destinationMode === 'all' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white'}`}
              type="button"
              disabled={groups.length === 0}
              onClick={() => { onDestinationModeChange('all'); onSelectedGroupClear() }}
            >
              Todos
            </button>
          </div>
        </div>

        <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="message">
            Mensaje
            <textarea
              className="ui-field min-h-44 resize-none p-4 text-sm leading-6"
              id="message"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Escribir mensaje..."
              rows={7}
            />
          </label>

          <div className="flex items-center gap-3">
            <label className="ui-btn ui-btn-secondary pressable cursor-pointer">
              <Image size={16} />
              <span>{selectedFile ? 'Cambiar foto' : 'Adjuntar foto'}</span>
              <input
                accept="image/*"
                className="sr-only"
                type="file"
                onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
              />
            </label>
            {selectedFile && (
              <button
                className="pressable text-sm font-medium text-rose-600 hover:text-rose-800"
                type="button"
                onClick={() => onFileSelect(null)}
              >
                Quitar foto
              </button>
            )}
          </div>

          {imagePreview && (
            <div className="surface-card bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{selectedFile?.name}</p>
                  <p className="text-xs text-slate-400">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ''}
                  </p>
                </div>
              </div>
              <img
                className="mt-2 max-h-40 w-full rounded-lg object-contain bg-white"
                src={imagePreview}
                alt={selectedFile?.name || 'Preview'}
              />
            </div>
          )}

          <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="delay-seconds">
            Pausa entre grupos
            <div className="surface-card grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 px-3 py-2">
              <input
                className="accent-slate-950"
                min={0}
                max={60}
                type="range"
                value={delaySeconds}
                onChange={(event) => onDelayChange(Number(event.target.value) || 0)}
              />
              <input
                className="ui-field h-9 min-h-9 px-2 text-center text-sm font-medium"
                id="delay-seconds"
                min={0}
                max={60}
                type="number"
                value={delaySeconds}
                onChange={(event) => onDelayChange(Number(event.target.value) || 0)}
              />
            </div>
          </label>

          <div className="surface-card grid grid-cols-2 gap-2 bg-slate-50 p-3 text-sm">
            <div>
              <span className="block text-xs text-slate-500">Destinos</span>
              <strong className="text-slate-950">{destinationCount}</strong>
            </div>
            <div>
              <span className="block text-xs text-slate-500">Estimado</span>
              <strong className="text-slate-950">{estimatedLabel}</strong>
            </div>
          </div>
        </form>

        {progressTotal > 0 && (
          <section className="surface-card animate-slide-up mt-5 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Progreso de envio</p>
                <p className="text-sm text-slate-600">
                  {currentGroupName
                    ? `Enviando ${currentSendIndex} de ${progressTotal}: ${currentGroupName}`
                    : `${progressDone} de ${progressTotal} procesados`}
                </p>
              </div>
              <strong className="text-lg text-slate-950">{progressPercent}%</strong>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button className={secondaryButton} type="button" disabled={failedResultsCount === 0 || sendState === 'loading' || !message.trim()} onClick={onRetryFailed}>
                Reintentar fallidos ({failedResultsCount})
              </button>
              <button className={secondaryButton} type="button" disabled={sendState === 'loading'} onClick={onClearResults}>
                Limpiar resultados
              </button>
            </div>

            <div className="scroll-area mt-4 max-h-52 overflow-auto rounded-md border border-slate-200 bg-white">
              {sendResults.map((result) => (
                <div className="animate-list-item grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0" key={result.id}>
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${result.ok ? 'bg-emerald-500' : result.error ? 'bg-rose-500' : 'bg-slate-300'}`} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{result.name}</p>
                    <p className={`truncate text-xs ${result.error ? 'text-rose-700' : 'text-slate-500'}`}>
                      {result.ok ? 'Enviado' : result.error ?? 'Pendiente'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {sendFeedback && (
          <p
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              sendState === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {sendFeedback}
          </p>
        )}
      </div>

      <div className="border-t !border-slate-200/70 bg-white/85 px-5 py-4 backdrop-blur-xl">
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button className={secondaryButton} type="button" disabled={!message.trim() && !mediaAttachment || sendState === 'loading'} onClick={() => {
              if (!sessionConnected) { onToast('Escanea el codigo QR para conectar WhatsApp antes de programar un envio', 'error'); return }
              onSchedule()
            }}>
              <Calendar size={14} />
              <span className="ml-1.5">Programar</span>
            </button>
            <button className={primaryButton} type="button" disabled={!canSend && sessionConnected} onClick={() => {
              if (!sessionConnected) { onToast('Escanea el codigo QR para conectar WhatsApp antes de enviar', 'error'); return }
              onSend()
            }}>
              {sendState === 'loading' ? 'Enviando...' : `Enviar${destinationCount > 0 ? ` a ${destinationCount}` : ''}`}
            </button>
          </div>
          <button className={dangerButton} type="button" disabled={sendState !== 'loading'} onClick={onCancelSend}>
            Cancelar envio
          </button>
        </div>
      </div>
    </aside>
  )
}
