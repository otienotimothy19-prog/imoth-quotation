import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, quoteMoney as money, saveQuoteFlow } from '../../api/client';
import QuoteOfferActions from '../../components/QuoteOfferActions';

export default function QuoteOffer() {
  const { offerId } = useParams();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState(() => token ? '' : 'This quotation link is missing its access token. Please open the link in your email again.');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) return;
    api.get(`/api/quote-offers/${offerId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => setOffer(data)).catch(err => setError(errorMessage(err)));
  }, [offerId, token]);
  async function accept() {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/api/quote-offers/${offerId}/select`, {}, { headers: { Authorization: `Bearer ${token}` } });
      const { access_token, ...selectionSummary } = data;
      saveQuoteFlow({ selectionId: offerId, quotationId: null, token: access_token, selectionSummary });
      navigate(`/quote/select/${offerId}`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }
  return <div className="card">
    <h1>Motor Insurance Quotation</h1>
    {error && <p role="alert">{error}</p>}
    {offer ? <><h2>{offer.insurer_name}</h2><p>{offer.vehicle_class_label}</p><p>Total premium: {money(offer.total_premium)}</p>
      <QuoteOfferActions offer={{ ...offer, offer_id: offerId, offer_token: token }}>
        <button className="btn btn-primary" disabled={busy} onClick={accept}>Accept This Quote</button>
      </QuoteOfferActions></> : !error && <p role="status">Loading quotation…</p>}
  </div>;
}
