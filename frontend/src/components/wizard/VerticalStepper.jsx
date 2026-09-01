import { QUOTE_STEPS } from "./steps";

/**
 * Renders the list of four steps (used by both the desktop sidebar and the
 * mobile drawer). `currentIndex` and `maxReachedIndex` are 0-based.
 * Completed steps (index < currentIndex) are clickable so the customer can
 * go back and edit; future incomplete steps are not clickable.
 */
export default function VerticalStepper({ currentIndex, errorIndex, onNavigate, canNavigateTo }) {
  return (
    <ol className="v-steps">
      {QUOTE_STEPS.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const hasError = errorIndex === i;
        const clickable = done && !!onNavigate && (canNavigateTo ? canNavigateTo(i) : true);
        const stateClass = hasError ? "v-step-error" : done ? "v-step-done" : current ? "v-step-current" : "";

        return (
          <li key={step.key} className={`v-step ${stateClass}`}>
            <span className="v-step-track" aria-hidden="true">
              <span className="v-step-circle">{done && !hasError ? "✓" : i + 1}</span>
              {i < QUOTE_STEPS.length - 1 && <span className="v-step-line" />}
            </span>
            <span className="v-step-body">
              {clickable ? (
                <button
                  type="button"
                  className="v-step-label v-step-clickable"
                  onClick={() => onNavigate(i)}
                  aria-current={current ? "step" : undefined}
                >
                  {step.label}
                </button>
              ) : (
                <span className="v-step-label" aria-current={current ? "step" : undefined}>
                  {step.label}
                </span>
              )}
              {current && <span className="v-step-current-tag">Current step</span>}
              {hasError && (
                <span className="v-step-error-text">
                  <span aria-hidden="true">⚠</span> Needs your attention
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
