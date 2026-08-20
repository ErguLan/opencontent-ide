/**
 * CliTerminal — Classic terminal-style CLI component.
 * Full-screen, monospace, no chrome. Type directly at the prompt.
 */

import { useRef, useEffect } from 'react';
import './Cli.css';

function CliLine({ line }) {
    const cls = line.type === 'error' ? 'cli-error'
        : line.type === 'success' ? 'cli-success'
        : line.type === 'command' ? 'cli-command'
        : line.type === 'banner' ? 'cli-banner'
        : 'cli-info';
    return <div className={`cli-line ${cls}`}>{line.message}</div>;
}

export default function CliTerminal({ input, setInput, lines, inputRef, handleKeyDown }) {
    const scrollRef = useRef(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines, input]);

    return (
        <div className="cli-terminal" onClick={() => inputRef.current?.focus()}>
            <div className="cli-output" ref={scrollRef}>
                {lines.map((line, index) => (
                    <CliLine key={index} line={line} />
                ))}
                <div className="cli-input-line">
                    <span className="cli-prompt">$</span>
                    <input
                        ref={inputRef}
                        type="text"
                        className="cli-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="off"
                        autoFocus
                        aria-label="CLI input"
                    />
                </div>
            </div>
        </div>
    );
}
