import { useEffect, useState } from "react";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribe } from "../pwa/install";

// "Download the app" button. On Android/Chrome/Edge (phone or desktop) it
// opens the browser's own install dialog; on iPhone/iPad, where Safari has
// no install prompt, it shows the Add to Home Screen steps instead. Hidden
// once the app is already running installed.
export default function InstallAppButton({ className = "btn btn-secondary", style, block = false }) {
  const [, force] = useState(0);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => subscribe(() => force((n) => n + 1)), []);

  if (isStandalone()) return null;
  const ios = isIos();
  if (!ios && !canPromptInstall()) return null;

  return (
    <div style={{ width: block ? "100%" : undefined }}>
      <button
        type="button"
        className={className}
        style={{ width: block ? "100%" : undefined, ...style }}
        onClick={() => (ios ? setShowIosHelp((v) => !v) : promptInstall())}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-3px" }}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Download the app
      </button>
      {showIosHelp && (
        <div className="alert alert-info" style={{ marginTop: 8, fontSize: 13, textAlign: "left" }}>
          On iPhone or iPad: tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.
        </div>
      )}
    </div>
  );
}
