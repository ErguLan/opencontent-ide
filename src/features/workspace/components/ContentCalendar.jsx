/**
 * ContentCalendar — Schedule and manage content
 * OpenContent IDE
 * 
 * A mini content calendar panel in the workspace sidebar.
 * Users can schedule generated content for specific dates.
 * Data persists in localStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import Icon, { ICONS } from '../../../components/icons/Icon';

const STORAGE_KEY = 'oc_content_calendar';

function getStoredEntries() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
}

function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function ContentCalendar({ isOpen, onClose, onLoadContent }) {
    const [entries, setEntries] = useState(getStoredEntries);
    const [showAdd, setShowAdd] = useState(false);
    const [newEntry, setNewEntry] = useState({
        date: getToday(),
        title: '',
        content: '',
        platform: 'instagram',
        status: 'draft'
    });
    const [selectedWeek, setSelectedWeek] = useState(0);

    const platforms = [
        { id: 'instagram', emoji: '📱', label: 'Instagram' },
        { id: 'twitter', emoji: '🐦', label: 'Twitter/X' },
        { id: 'linkedin', emoji: '💼', label: 'LinkedIn' },
        { id: 'email', emoji: '📧', label: 'Email' },
        { id: 'blog', emoji: '📝', label: 'Blog' },
        { id: 'youtube', emoji: '🎬', label: 'YouTube' },
        { id: 'other', emoji: '📌', label: 'Other' }
    ];

    const statusOptions = [
        { id: 'draft', label: 'Draft', color: '#666' },
        { id: 'ready', label: 'Ready', color: '#4ade80' },
        { id: 'published', label: 'Published', color: '#7c3aed' }
    ];

    const handleAdd = () => {
        if (!newEntry.title.trim()) return;
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            ...newEntry,
            createdAt: new Date().toISOString()
        };
        const updated = [...entries, entry].sort((a, b) => a.date.localeCompare(b.date));
        setEntries(updated);
        saveEntries(updated);
        setNewEntry({ date: getToday(), title: '', content: '', platform: 'instagram', status: 'draft' });
        setShowAdd(false);
    };

    const handleDelete = (id) => {
        const updated = entries.filter(e => e.id !== id);
        setEntries(updated);
        saveEntries(updated);
    };

    const handleStatusChange = (id, newStatus) => {
        const updated = entries.map(e => e.id === id ? { ...e, status: newStatus } : e);
        setEntries(updated);
        saveEntries(updated);
    };

    const handleLoad = (entry) => {
        if (onLoadContent) onLoadContent(entry.content || entry.title);
    };

    // Week navigation
    const getWeekDays = useCallback(() => {
        const now = new Date();
        now.setDate(now.getDate() + selectedWeek * 7);
        const monday = new Date(now);
        monday.setDate(monday.getDate() - monday.getDay() + 1);
        
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday);
            d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    }, [selectedWeek]);

    const weekDays = getWeekDays();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    if (!isOpen) return null;

    return (
        <div className="calendar-panel">
            <div className="calendar-panel-header">
                <h3 className="calendar-title">
                    <span>📅</span> Content Calendar
                </h3>
                <button className="calendar-close" onClick={onClose}>
                    <Icon src={ICONS.CLOSE} size="xs" />
                </button>
            </div>

            {/* Week Navigation */}
            <div className="calendar-week-nav">
                <button onClick={() => setSelectedWeek(w => w - 1)} className="calendar-nav-btn">←</button>
                <span className="calendar-week-label">
                    {selectedWeek === 0 ? 'This week' : selectedWeek > 0 ? `+${selectedWeek} week${selectedWeek > 1 ? 's' : ''}` : `${selectedWeek} week${Math.abs(selectedWeek) > 1 ? 's' : ''}`}
                </span>
                <button onClick={() => setSelectedWeek(w => w + 1)} className="calendar-nav-btn">→</button>
            </div>

            {/* Mini Calendar Grid */}
            <div className="calendar-mini-grid">
                {weekDays.map((dateStr, i) => {
                    const dayEntries = entries.filter(e => e.date === dateStr);
                    const isToday = dateStr === getToday();
                    return (
                        <div
                            key={dateStr}
                            className={`calendar-day-cell ${isToday ? 'calendar-day-today' : ''} ${dayEntries.length > 0 ? 'calendar-day-has-content' : ''}`}
                        >
                            <span className="calendar-day-name">{dayNames[i]}</span>
                            <span className="calendar-day-number">{new Date(dateStr + 'T12:00:00').getDate()}</span>
                            {dayEntries.length > 0 && (
                                <div className="calendar-day-dots">
                                    {dayEntries.slice(0, 3).map(e => (
                                        <span
                                            key={e.id}
                                            className="calendar-dot"
                                            style={{ background: statusOptions.find(s => s.id === e.status)?.color || '#666' }}
                                            title={e.title}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Entries for this week */}
            <div className="calendar-entries">
                {weekDays.map(dateStr => {
                    const dayEntries = entries.filter(e => e.date === dateStr);
                    if (dayEntries.length === 0) return null;
                    return dayEntries.map(entry => (
                        <div key={entry.id} className="calendar-entry-card">
                            <div className="calendar-entry-top">
                                <span className="calendar-entry-platform">
                                    {platforms.find(p => p.id === entry.platform)?.emoji || '📌'}
                                </span>
                                <span className="calendar-entry-title">{entry.title}</span>
                                <select
                                    className="calendar-status-select"
                                    value={entry.status}
                                    onChange={e => handleStatusChange(entry.id, e.target.value)}
                                    style={{ color: statusOptions.find(s => s.id === entry.status)?.color }}
                                >
                                    {statusOptions.map(s => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="calendar-entry-meta">
                                <span>{formatDate(entry.date)}</span>
                                <div className="calendar-entry-actions">
                                    {entry.content && (
                                        <button onClick={() => handleLoad(entry)} title="Load into editor">
                                            <Icon src={ICONS.IMPORT} size="xs" />
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(entry.id)} title="Delete">
                                        <Icon src={ICONS.DELETE} size="xs" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ));
                })}

                {entries.filter(e => weekDays.includes(e.date)).length === 0 && (
                    <div className="calendar-empty">
                        No content scheduled this week
                    </div>
                )}
            </div>

            {/* Add Entry Form */}
            {showAdd ? (
                <div className="calendar-add-form">
                    <input
                        type="text"
                        className="calendar-input"
                        placeholder="Content title..."
                        value={newEntry.title}
                        onChange={e => setNewEntry({...newEntry, title: e.target.value})}
                        autoFocus
                    />
                    <textarea
                        className="calendar-textarea"
                        placeholder="Content body (optional)..."
                        value={newEntry.content}
                        onChange={e => setNewEntry({...newEntry, content: e.target.value})}
                        rows={2}
                    />
                    <div className="calendar-add-row">
                        <input
                            type="date"
                            className="calendar-date-input"
                            value={newEntry.date}
                            onChange={e => setNewEntry({...newEntry, date: e.target.value})}
                        />
                        <select
                            className="calendar-platform-select"
                            value={newEntry.platform}
                            onChange={e => setNewEntry({...newEntry, platform: e.target.value})}
                        >
                            {platforms.map(p => (
                                <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="calendar-add-actions">
                        <button className="calendar-btn-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
                        <button className="calendar-btn-add" onClick={handleAdd} disabled={!newEntry.title.trim()}>Add</button>
                    </div>
                </div>
            ) : (
                <button className="calendar-add-btn" onClick={() => setShowAdd(true)}>
                    + Schedule Content
                </button>
            )}
        </div>
    );
}

/**
 * CalendarToggle — Button to toggle calendar panel
 */
export function CalendarToggle({ onClick, hasEntries }) {
    return (
        <button
            type="button"
            className="calendar-toggle-btn"
            onClick={onClick}
            title="Content Calendar"
            style={{
                background: hasEntries ? 'var(--color-primary-dim, rgba(124,58,237,0.15))' : 'var(--bg-secondary, #2a2a2a)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: '8px',
                padding: '6px 12px',
                color: hasEntries ? 'var(--color-primary, #7c3aed)' : 'var(--text-secondary, #aaa)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
            }}
        >
            📅 Calendar
        </button>
    );
}

export default ContentCalendar;
