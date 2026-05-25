import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full min-h-[300px] px-6 text-center">
          <AlertCircle size={40} className="text-[var(--color-live)]" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Something went wrong</h2>
          <p className="text-sm text-[var(--color-muted)] max-w-md">
            {this.state.error.message}
          </p>
          <Button variant="outline" onClick={() => { this.setState({ error: null }); window.location.reload() }}>
            <RefreshCw size={14} /> Reload page
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
