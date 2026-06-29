/** Format a number as Nigerian Naira — e.g. ₦1,234,567.00 */
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return '₦' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format a date for Nigerian locale — e.g. "12 May 2025, 3:45pm WAT" */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-NG', {
    day:      'numeric',
    month:    'long',
    year:     'numeric',
    hour:     'numeric',
    minute:   '2-digit',
    hour12:   true,
    timeZone: 'Africa/Lagos',
  }).replace(',', '') + ' WAT';
}

/** Generate a unique reference string — prefix + timestamp + random hex. */
export function generateRef(prefix: string): string {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${ts}_${rnd}`;
}

/** Generate an 8-character alphanumeric referral code. */
export function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}
