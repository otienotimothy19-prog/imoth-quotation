import { useEffect, useRef, useState } from 'react';
import { api, downloadBlob, errorMessage } from '../api/client';

export default function QuoteOfferActions({ offer, children }) {
  const dialog = useRef(null);
  const shareButton = useRef(null);
  const emailInput = useRef(null);
  const sendingLock = useRef(false);
  const downloadingLock = useRef(false);
  const deliveryKey = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalError, setModalError] = useState('');
  const [open, setOpen] = useState(false);
  const available = Boolean(offer.offer_id && offer.offer_token);
  const config = { headers: { Authorization: `Bearer ${offer.offer_token}` } };
  const path = `/api/quote-offers/${offer.offer_id}`;

  useEffect(() => {
    if (open) { dialog.current.showModal(); emailInput.current.focus(); }
    else if (dialog.current.open) { dialog.current.close(); shareButton.current.focus(); }
  }, [open]);

  async function download() {
    if (downloadingLock.current) return;
    downloadingLock.current = true;
    setDownloading(true); setError('');
    try {
      const res = await api.get(`${path}/pdf`, { ...config, responseType: 'blob' });
      const insurer = offer.insurer_name.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-|-$/g, '');
      downloadBlob(res.data, `Imoth-Motor-Quote-${insurer}-${offer.offer_id}.pdf`);
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        try { err.response.data = JSON.parse(await err.response.data.text()); } catch { /* use fallback */ }
      }
      setError(errorMessage(err, 'Could not prepare the PDF. Please try again.'));
    } finally { downloadingLock.current = false; setDownloading(false); }
  }

  async function send(event) {
    event.preventDefault();
    if (sendingLock.current) return;
    const recipient = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /[\r\n]/.test(email)) {
      setModalError('Enter a valid email address.'); emailInput.current.focus(); return;
    }
    sendingLock.current = true; setSending(true); setModalError('');
    // Keep the same key on an uncertain network result; changing address starts a new delivery.
    if (!deliveryKey.current || deliveryKey.current.email !== recipient) {
      deliveryKey.current = { email: recipient, key: crypto.randomUUID() };
    }
    try {
      const res = await api.post(`${path}/email`, { email: recipient }, {
        headers: { ...config.headers, 'Idempotency-Key': deliveryKey.current.key },
      });
      setNotice(res.data.message || `Quotation sent successfully to ${recipient}`);
      setOpen(false);
    } catch (err) {
      setModalError(errorMessage(err, 'Could not send the quotation. Please try again.'));
      if (err.response?.status === 503) deliveryKey.current = null;
    } finally { sendingLock.current = false; setSending(false); }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const elements = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <>
    <div className="quote-offer-actions">
      <button type="button" className="btn btn-secondary btn-sm offer-download" disabled={!available || downloading} onClick={download}
        aria-label={`Download quote from ${offer.insurer_name}`}>
        {downloading ? 'Preparing PDF…' : 'Download Quote'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm offer-share" ref={shareButton} disabled={!available}
        onClick={() => { setModalError(''); setOpen(true); }} aria-label={`Share quote from ${offer.insurer_name} by email`}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg>
        Share by Email
      </button>
      <div className="offer-accept">{children}</div>
    </div>
    {!available && <p className="hint">Enter the required tonnage to prepare this quotation.</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    <p role="status" aria-live="polite">{notice}</p>
    <dialog ref={dialog} className="quote-share-dialog" aria-labelledby={`share-title-${offer.motor_class_id || offer.offer_id}`}
      onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => { setOpen(false); shareButton.current.focus(); }} onKeyDown={trapFocus}>
      <form onSubmit={send} noValidate>
        <h2 id={`share-title-${offer.motor_class_id || offer.offer_id}`}>Share this quotation</h2>
        <label htmlFor={`share-email-${offer.offer_id}`}>Email address</label>
        <input ref={emailInput} id={`share-email-${offer.offer_id}`} type="email" autoComplete="email" placeholder="name@example.com"
          value={email} disabled={sending} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(modalError)} />
        {modalError && <p role="alert">{modalError}</p>}
        <div className="quote-share-controls">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={sending}>{sending ? 'Sending…' : 'Send Quotation'}</button>
        </div>
      </form>
    </dialog>
  </>;
}
