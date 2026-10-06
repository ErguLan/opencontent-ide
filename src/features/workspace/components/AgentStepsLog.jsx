/**
 * AgentStepsLog — live step log of the running request.
 *
 * Renders whatever the agentic pipeline publishes. Step statuses come from
 * `AGENTIC_STEP_STATUS`, never from literal strings.
 */

import Icon, { ICONS } from '../../../components/icons/Icon';
import { AGENTIC_STEP_STATUS } from '../utils/agentSteps';

const STATUS_ICONS = Object.freeze({
    [AGENTIC_STEP_STATUS.COMPLETED]: ICONS.CHECK,
    [AGENTIC_STEP_STATUS.FAILED]: ICONS.INFO,
    [AGENTIC_STEP_STATUS.SKIPPED]: ICONS.DOCK
});

function AgentStepsLog({ steps, compact = false }) {
    if (!Array.isArray(steps) || steps.length === 0) return null;

    if (compact) {
        return (
            <div className="agent-steps-compact">
                {steps.map((step) => (
                    <div key={step.id} className={`step-pill status-${step.status}`}>
                        {STATUS_ICONS[step.status]
                            ? <Icon src={STATUS_ICONS[step.status]} size="xs" alt="" />
                            : null}
                        <span>{step.text}</span>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="agent-steps-log" role="list">
            {steps.map((step) => (
                <div key={step.id} className={`step-item ${step.status}`} role="listitem">
                    <div className="step-dot" aria-hidden="true" />
                    <span className="step-text">{step.text}</span>
                </div>
            ))}
        </div>
    );
}

export default AgentStepsLog;