import { useState } from 'react'
import type { Group } from './GroupList'
import type { MediaAttachment, ScheduledMessage } from '../hooks/useScheduledMessages'

type ScheduleModalProps = {
  open: boolean
  message: string
  selectedLabel: string
  destinationGroups: Group[]
  primaryButton: string
  secondaryButton: string
  mediaPreview?: string | null
  mediaName?: string | null
  mediaAttachment?: MediaAttachment | null
  onClose: () => void
  onCreateScheduled: (groups: Group[], message: string, scheduledAt: string, media?: MediaAttachment) => Promise<ScheduledMessage>
}

export default function ScheduleModal({
  open,
  message,
  selectedLabel,
  destinationGroups,
  primaryButton,
  secondaryButton,
  mediaPreview,
  mediaName,
  mediaAttachment,
  onClose,
  onCreateScheduled,
}: ScheduleModalProps) {
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const closeModal = () => {
    if (!saving) onClose()
  }

  const createSchedule = async () => {
    const reminderMessage = message.trim()

    if (!reminderMessage || destinationGroups.length === 0) return

    setSaving(true)
    setFeedback('')

    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString()
      await onCreateScheduled(destinationGroups, reminderMessage, scheduledAt, mediaAttachment || undefined)
      setFeedback('Mensaje programado correctamente')
      setFeedbackType('success')
      onClose()
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Error al programar')
      setFeedbackType('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-md" onClick={closeModal}>
      <section
        className="modal-surface surface-panel max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b !border-slate-200/70 bg-slate-50/80 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-kicker">Programar</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950" id="schedule-title">Programar envio</h2>
            </div>
            <button
              className="icon-btn"
              type="button"
              aria-label="Cerrar"
              onClick={closeModal}
            >
              X
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-5">
          <div className="surface-card bg-slate-50 p-4">
            <p className="section-kicker">Destino</p>
            <strong className="mt-1 block text-base text-slate-950">{selectedLabel}</strong>
            <p className="mt-1 text-sm text-slate-500">{destinationGroups.length} grupo{destinationGroups.length !== 1 ? 's' : ''}</p>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="schedule-message">
            Mensaje
            <textarea
              className="ui-field min-h-24 resize-none p-4 text-sm leading-6"
              id="schedule-message"
              value={message}
              readOnly
              rows={4}
            />
          </label>

          {mediaPreview && (
            <div className="surface-card bg-slate-50 p-3">
              <p className="section-kicker mb-2">Foto adjunta</p>
              <img className="max-h-32 rounded-lg object-contain" src={mediaPreview} alt={mediaName || 'Foto'} />
              {mediaName && <p className="mt-1 text-xs text-slate-500">{mediaName}</p>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="schedule-date">
              Fecha
              <input
                className="ui-field px-3 text-sm font-normal"
                id="schedule-date"
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-950" htmlFor="schedule-time">
              Hora
              <input
                className="ui-field px-3 text-sm font-normal"
                id="schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </label>
          </div>

          {feedback && (
            <p className={`rounded-xl px-3 py-2 text-sm ${
              feedbackType === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'
            }`}>{feedback}</p>
          )}
        </div>

        <div className="grid gap-2 border-t !border-slate-200/70 bg-slate-50/80 px-5 py-4 sm:grid-cols-2">
          <button className={secondaryButton} type="button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button className={primaryButton} type="button" disabled={!scheduleDate || !scheduleTime || saving} onClick={createSchedule}>
            {saving ? 'Programando...' : 'Programar envio'}
          </button>
        </div>
      </section>
    </div>
  )
}
