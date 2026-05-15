import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (typeof window !== "undefined" && window.console) {
      console.error("[Vaani ErrorBoundary]", error, info?.componentStack);
    }
  }

  reset = () => {
    this.setState({ error: null, info: null });
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="tp-fatal">
        <div className="tp-fatal-card">
          <div className="tp-fatal-mark">!</div>
          <div className="tp-fatal-title">Something broke on our side</div>
          <p className="tp-fatal-body">
            Vaani hit an unexpected error and stopped. No audio or analysis was lost — your last
            saved result is still in your account history. Please reload, or email
            {" "}<a href="mailto:neilshankarray@vaaani.in" className="tp-link">neilshankarray@vaaani.in</a> if it keeps happening.
          </p>
          <pre className="tp-fatal-detail">{String(this.state.error?.message || this.state.error)}</pre>
          <button className="tp-btn tp-btn--primary" onClick={this.reset}>Reload Vaani</button>
        </div>
      </div>
    );
  }
}
