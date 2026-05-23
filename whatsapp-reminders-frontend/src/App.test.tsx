import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renderiza el titulo principal', () => {
    render(<App />)
    expect(screen.getByText('WhatsApp Reminders')).toBeInTheDocument()
  })

  it('renderiza los controles de sesion', () => {
    render(<App />)
    expect(screen.getByText('Ajustes')).toBeInTheDocument()
    expect(screen.getByText('Actualizar')).toBeInTheDocument()
  })
})
