/**
 * CliTerminal — interactive browser CLI with transient suggestions.
 */
import { useRef, useEffect } from 'react';
import './Cli.css';

function CliLine({ line }) {
    const cls = line.type === 'error' ? 'cli-error'
        : line.type === 'success' ? 'cli-success'
        : line.type === 'warning' ? 'cli-warning'
        : line.type === 'command' ? 'cli-command'
        : line.type === 'banner' ? 'cli-banner'
        : 'cli-info';
    return <div className={`cli-line ${cls}`}>{line.message}</div>;
}

export default function CliTerminal({ input, setInput, lines, inputRef, handleKeyDown, suggestions = [], suggestionIndex = 0, selectSuggestion, context = {} }) {
    const scrollRef = useRef(null);
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines]);

    return (
        <div className="cli-terminal" onClick={() => inputRef.current?.focus()}>
            <div className="cli-context-bar" aria-label="CLI context">
                <span>OpenContent</span>
                <span>text: {context.textModel || 'none'}</span>
                <span>vision: {context.visionModel || 'none'}</span>
                <span>image: {context.imageModel || 'none'}</span>
            </div>
            <div className="cli-output" ref={scrollRef}>
                {lines.map((line, index) => <CliLine key={`${index}-${line.type}`} line={line} />)}
                <div className="cli-composer">
                    <div className="cli-input-line">
                        <span className="cli-prompt">oc&gt;</span>
                        <input
                            ref={inputRef}
                            type="text"
                            className="cli-input"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={handleKeyDown}
                            spellCheck={false}
                            autoComplete="off"
                            autoCapitalize="off"
                            autoFocus
                            aria-label="CLI input"
                            aria-autocomplete="list"
                            aria-expanded={suggestions.length > 0}
                        />
                    </div>
                    {suggestions.length > 0 && (
                        <div className="cli-suggestions" role="listbox" aria-label="Command suggestions">
                            {suggestions.map((suggestion, index) => (
                                <button
                                    key={suggestion}
                                    type="button"
                                    role="option"
                                    aria-selected={index === suggestionIndex}
                                    className={`cli-suggestion ${index === suggestionIndex ? 'is-active' : ''}`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => selectSuggestion(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                            <span className="cli-suggestion-hint">Tab complete · Esc dismiss</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="cli-live-status" aria-live="polite" aria-atomic="true">
                {lines.at(-1)?.type === 'error' ? 'Command failed.' : lines.at(-1)?.type === 'success' ? 'Command complete.' : ''}
            </div>
        </div>
    );
}
