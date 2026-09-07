import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import QuoteOfferActions from './QuoteOfferActions';
import { api, downloadBlob } from '../api/client';
vi.mock('../api/client', async () => ({ ...(await vi.importActual('../api/client')), api: { get: vi.fn(), post: vi.fn() }, downloadBlob: vi.fn() }));
const offer = { offer_id: 'offer-1', offer_token: 'token-1', insurer_name: 'Insurer One', motor_class_id: 'class-1' };
beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
function show() { render(<QuoteOfferActions offer={offer}><button>Accept This Quote</button></QuoteOfferActions>); }
it('places download and email before acceptance', () => {
  show();
  expect(screen.getAllByRole('button').map(button => button.textContent.trim())).toEqual([
    'Download Quote', 'Share by Email', 'Accept This Quote',
  ]);
});
it('downloads the selected offer through an authenticated blob and blocks repeated clicks', async () => {
  let resolve;
  api.get.mockImplementation(() => new Promise(done => { resolve = done; }));
  show();
  const button = screen.getByRole('button', { name: /download quote/i });
  fireEvent.click(button); fireEvent.click(button);
  expect(button).toBeDisabled(); expect(screen.getByText('Preparing PDF…')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/api/quote-offers/offer-1/pdf', { headers: { Authorization: 'Bearer token-1' }, responseType: 'blob' });
  const blob = new Blob(['PDF']); resolve({ data: blob, headers: { 'content-disposition': 'attachment; filename="Imoth-Motor-Quote-KAA123A-Insurer-One.pdf"' } });
  await waitFor(() => expect(button).toBeEnabled());
  expect(downloadBlob).toHaveBeenCalledWith(blob, 'Imoth-Motor-Quote-KAA123A-Insurer-One.pdf');
  expect(api.post).not.toHaveBeenCalled();
});
it('validates email, prevents duplicate sends, announces success and restores focus', async () => {
  let resolve;
  api.post.mockImplementation(() => new Promise(done => { resolve = done; }));
  show();
  const trigger = screen.getByRole('button', { name: /share quote/i }); fireEvent.click(trigger);
  const input = screen.getByRole('textbox', { name: 'Email address' });
  expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Quotation' }));
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('valid email');
  fireEvent.change(input, { target: { value: 'client@example.com' } });
  const send = screen.getByRole('button', { name: 'Send Quotation' });
  fireEvent.click(send); fireEvent.click(send);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/api/quote-offers/offer-1/email', { email: 'client@example.com' }, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-1' }) }));
  resolve({ data: { message: 'Quotation sent successfully to client@example.com' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Quotation sent successfully'));
  await waitFor(() => expect(trigger).toHaveFocus());
});
it('keeps the dialog open on delivery failure and traps tab focus', async () => {
  api.post.mockRejectedValue({ response: { status: 503, data: { detail: 'Delivery unavailable' } } });
  show(); fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
  const input = screen.getByRole('textbox');
  const send = screen.getByRole('button', { name: 'Send Quotation' });
  input.focus(); fireEvent.keyDown(input, { key: 'Tab', shiftKey: true }); expect(send).toHaveFocus();
  fireEvent.keyDown(send, { key: 'Tab' }); expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: 'client@example.com' } }); fireEvent.click(send);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Delivery unavailable'));
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
  await waitFor(() => expect(screen.getByRole('button', { name: /share quote/i })).toHaveFocus());
});
