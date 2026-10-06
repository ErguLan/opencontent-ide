/**
 * Agent step helpers for the workspace.
 *
 * The agentic pipeline owns the step status vocabulary. This module re-exports
 * the constants and provides the transitions the workspace needs, so no consumer
 * ever hardcodes a status string.
 */

import { AGENTIC_STEP_STATUS, AGENTIC_STEP_STATUSES } from '../../../services/ai/agenticPipeline';

export { AGENTIC_STEP_STATUS, AGENTIC_STEP_STATUSES };

const TERMINAL_STATUSES = new Set([
    AGENTIC_STEP_STATUS.COMPLETED,
    AGENTIC_STEP_STATUS.FAILED,
    AGENTIC_STEP_STATUS.SKIPPED
]);

/** A step that can no longer change state. */
export const isTerminalStepStatus = (status) => TERMINAL_STATUSES.has(status);

export const createStep = (id, text, status) => ({ id, text, status });

/**
 * `onSteps` receives an array in the tool strategy and an updater function in
 * the plan strategy. Both signatures are normalized here.
 */
export const resolveSteps = (current, next) => {
    if (typeof next === 'function') return next(current) || [];
    return Array.isArray(next) ? next : [];
};

/** Runs that ended without a fatal error must not leave steps in `working`. */
export const settleSteps = (steps) => (Array.isArray(steps) ? steps : [])
    .map((step) => (step.status === AGENTIC_STEP_STATUS.WORKING
        ? { ...step, status: AGENTIC_STEP_STATUS.COMPLETED }
        : step));

export const failWorkingSteps = (steps, text) => (Array.isArray(steps) ? steps : [])
    .map((step) => (step.status === AGENTIC_STEP_STATUS.WORKING
        ? { ...step, status: AGENTIC_STEP_STATUS.FAILED, ...(text ? { text } : {}) }
        : step));

/** A cancelled run is not a failure: unfinished work is reported as skipped. */
export const skipWorkingSteps = (steps) => (Array.isArray(steps) ? steps : [])
    .map((step) => (step.status === AGENTIC_STEP_STATUS.WORKING
        ? { ...step, status: AGENTIC_STEP_STATUS.SKIPPED }
        : step));

export const replaceStep = (steps, id, patch) => (Array.isArray(steps) ? steps : [])
    .map((step) => (step.id === id ? { ...step, ...patch } : step));

/** Version step summaries always describe finished work. */
export const buildVersionSteps = (plan, prefix = 'agentic') => (Array.isArray(plan) ? plan : [])
    .map((step, index) => createStep(
        `${prefix}-${index}`,
        step?.description || step?.prompt || '',
        AGENTIC_STEP_STATUS.COMPLETED
    ));
