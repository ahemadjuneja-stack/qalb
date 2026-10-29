'use client'

// Qalb — React ErrorBoundary (Layer 4)
// ─────────────────────────────────────────────────────────────────
// Render crash pehle white screen ban jata tha = user app delete
// karta. Ab boundary pakadta hai, crash Firestore me jata hai
// (crash-report.ts), aur user ko recovery card milta hai.
//
// Class component isliye — React abhi bhi function components me
// error boundary support nahi karta.

import React from 'react'
import { reportCrash } from '@/lib/crash-report'
import { ErrorFallbackCard } from '@/components/qalb/recovery-screens'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

export class QalbErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = [error.stack, info.componentStack]
      .filter(Boolean)
      .join('\n──── component stack ────\n')
    void reportCrash('render', error.message || String(error), stack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return <ErrorFallbackCard onRetry={this.reset} />
    }
    return this.props.children
  }
}
