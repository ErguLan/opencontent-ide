/**
 * ErrorBoundary — keeps one broken component from taking down the whole app.
 *
 * Without this, a single bad prop blanks every route. This catches the render
 * error, shows what actually happened instead of a white page, and lets the
 * user recover without a reload.
 */

import { Component } from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null, info: null };
        this.handleReset = this.handleReset.bind(this);
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        this.setState({ info });
        this.props.onError?.(error, info);
    }

    handleReset() {
        this.setState({ error: null, info: null });
        this.props.onReset?.();
    }

    render() {
        const { error, info } = this.state;
        if (!error) return this.props.children;

        const t = this.props.t || ((key) => key);

        return (
            <div className="oc-error-boundary" role="alert">
                <div className="oc-error-boundary-panel">
                    <h1 className="oc-error-boundary-title">{t('errors.boundaryTitle')}</h1>
                    <p className="oc-error-boundary-message">
                        {t('errors.boundaryMessage')}
                    </p>
                    <p className="oc-error-boundary-hint">
                        {t('errors.boundaryHint')}
                    </p>
                    <pre className="oc-error-boundary-detail">{String(error?.message || error)}</pre>
                    {info?.componentStack && (
                        <details className="oc-error-boundary-stack">
                            <summary>{t('errors.boundaryStack')}</summary>
                            <pre>{info.componentStack}</pre>
                        </details>
                    )}
                    <div className="oc-error-boundary-actions">
                        <button type="button" onClick={this.handleReset}>
                            {t('errors.boundaryRetry')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
