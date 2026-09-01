import { useEffect, useRef, useState } from "react";
import VerticalStepper from "./VerticalStepper";
import { QUOTE_STEPS } from "./steps";

const WHATSAPP_URL = "https://wa.me/254759642797";

/**
 * Shared two-column layout for the four-step quotation journey. Desktop
 * gets a sticky vertical sidebar; below 900px that collapses into a
 * compact progress header with an expandable "view all steps" drawer.
 *
 * `currentIndex`/`maxReachedIndex` are 0-based indexes into QUOTE_STEPS.
 * `onNavigate(index)` is called when the customer clicks a completed step
 * to go back and edit it; omit it to make steps non-clickable (e.g. once
 * the quotation has been accepted).
 */
export default function QuoteShell({
  currentIndex,
  heading,
  subtitle,
  onNavigate,
  canNavigateTo,
  errorIndex,
  children,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const headingRef = useRef(null);
  const step = QUOTE_STEPS[currentIndex];
  const stepNumber = currentIndex + 1;
  const percent = Math.round((stepNumber / QUOTE_STEPS.length) * 100);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentIndex]);

  return (
    <div className="quote-shell">
      <div className="quote-mobile-progress">
        <div className="quote-mobile-progress-row">
          <div>
            <div className="quote-mobile-progress-step">
              Step {stepNumber} of {QUOTE_STEPS.length}
            </div>
            <div className="quote-mobile-progress-title">{step.label}</div>
          </div>
          <button
            type="button"
            className="quote-mobile-steps-toggle"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-expanded={drawerOpen}
          >
            {drawerOpen ? "Hide steps" : "View all steps"}
          </button>
        </div>
        <div className="quote-mobile-progress-bar">
          <div className="doc-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="doc-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
        {drawerOpen && (
          <div className="quote-mobile-drawer">
            <VerticalStepper currentIndex={currentIndex} errorIndex={errorIndex} onNavigate={onNavigate} canNavigateTo={canNavigateTo} />
          </div>
        )}
      </div>

      <div className="quote-shell-grid">
        <aside className="quote-sidebar" aria-label="Quotation progress">
          <h2 className="quote-sidebar-title">Your Motor Quote</h2>
          <div className="quote-sidebar-progress-row">
            <span>
              Step <strong>{stepNumber}</strong> of {QUOTE_STEPS.length}
            </span>
            <span>{percent}% complete</span>
          </div>
          <div className="doc-progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="doc-progress-fill" style={{ width: `${percent}%` }} />
          </div>

          <VerticalStepper currentIndex={currentIndex} errorIndex={errorIndex} onNavigate={onNavigate} canNavigateTo={canNavigateTo} />

          <div className="quote-sidebar-help">
            <p>Need assistance?</p>
            <a
              className="quote-sidebar-whatsapp"
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with Imoth Insurance Brokers on WhatsApp for help"
            >
              WhatsApp Us →
            </a>
          </div>
        </aside>

        <div className="quote-content">
          <p className="quote-content-eyebrow">
            Step {stepNumber} of {QUOTE_STEPS.length}
          </p>
          <h1 className="quote-content-heading" tabIndex={-1} ref={headingRef}>
            {heading}
          </h1>
          {subtitle && <p className="quote-content-sub">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}
