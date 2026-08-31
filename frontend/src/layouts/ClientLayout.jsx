import { Link, Outlet } from "react-router-dom";
import imothLogo from "../assets/imoth-logo.jpg";

const WHATSAPP_URL = "https://wa.me/254759642797";

export default function ClientLayout() {
  return (
    <div style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "20px 16px 60px" }}>
      <header className="card site-header" style={{ borderTop: "5px solid var(--imoth-red)" }}>
        <Link to="/" className="header-brand">
          <img className="header-logo" src={imothLogo} alt="Imoth Insurance Brokers logo" />
          <div className="header-titles">
            <strong style={{ display: "block", fontSize: 18, color: "var(--imoth-blue)" }}>
              Imoth Insurance Brokers
            </strong>
            <p>Motor Insurance Quotation Portal</p>
          </div>
        </Link>

        <div className="header-help">
          <span className="hint">Need help?</span>
          <a
            className="whatsapp-btn"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with Imoth Insurance Brokers on WhatsApp for help"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.95-.3-1.64-.6-2.88-1.24-4.76-4.13-4.9-4.32-.14-.19-1.17-1.56-1.17-2.98 0-1.42.75-2.11 1.02-2.4.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2 .9 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.2.71-.83.9-1.11.19-.29.38-.24.63-.14.26.1 1.66.78 1.94.93.29.14.48.21.55.33.07.13.07.72-.17 1.4Z" />
            </svg>
            WhatsApp Us
          </a>
        </div>
      </header>

      <Outlet />

      <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--muted)", marginTop: 30 }}>
        &copy; {new Date().getFullYear()} Imoth Insurance Brokers Limited. All rights reserved.
      </div>
    </div>
  );
}
