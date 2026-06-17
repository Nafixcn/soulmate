import React from 'react'
import { AlertTriangle } from 'lucide-react'

interface State { hasError: boolean; errorMsg: string }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, errorMsg: '' }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.message || String(error) }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error:', error.message, error.stack, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, fontFamily: 'sans-serif', color: '#666' }}>
          <AlertTriangle size={48} color="#f0a060" />
          <div>应用异常，请重启</div>
          <div style={{ fontSize: 12, maxWidth: 300, textAlign: 'center', wordBreak: 'break-all', color: '#999' }}>{this.state.errorMsg}</div>
          <button onClick={() => window.location.reload()} style={{ padding: '8px 24px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}>重新加载</button>
        </div>
      )
    }
    return this.props.children
  }
}
