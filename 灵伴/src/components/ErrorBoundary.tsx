import React from 'react'

interface State {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('App error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, fontFamily: 'sans-serif', color: '#666' }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div>应用出现异常，请重启</div>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: '8px 24px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer' }}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
