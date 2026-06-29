import https from 'https';
import { PaystackInitializeResponse } from '../../types';

const BASE_URL = 'api.paystack.co';

function paystackRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;

    const options: https.RequestOptions = {
      hostname: BASE_URL,
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as T;
          resolve(parsed);
        } catch {
          reject(new Error(`Paystack response parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Initialise a Paystack transaction. Returns authorization_url + reference. */
export async function initializeTransaction(params: {
  email: string;
  amount: number;         // in NAIRA — function converts to kobo
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitializeResponse> {
  return paystackRequest<PaystackInitializeResponse>('POST', '/transaction/initialize', {
    email:     params.email,
    amount:    Math.round(params.amount * 100),   // kobo
    reference: params.reference,
    metadata:  params.metadata ?? {},
    currency:  'NGN',
  });
}

/** Resolve a bank account number — used in withdrawal flow to confirm account name. */
export async function resolveAccount(params: {
  account_number: string;
  bank_code: string;
}): Promise<{ status: boolean; data: { account_name: string; account_number: string } }> {
  return paystackRequest(
    'GET',
    `/bank/resolve?account_number=${params.account_number}&bank_code=${params.bank_code}`
  );
}

/** List Nigerian banks supported by Paystack. */
export async function listBanks(): Promise<{
  status: boolean;
  data: Array<{ name: string; code: string; slug: string }>;
}> {
  return paystackRequest('GET', '/bank?currency=NGN&perPage=100');
}

/** Create a Paystack transfer recipient (needed before initiating payout). */
export async function createTransferRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}): Promise<{ status: boolean; data: { recipient_code: string } }> {
  return paystackRequest('POST', '/transferrecipient', {
    type:           'nuban',
    name:           params.name,
    account_number: params.account_number,
    bank_code:      params.bank_code,
    currency:       'NGN',
  });
}

/** Initiate a Paystack transfer (for approved withdrawals). */
export async function initiateTransfer(params: {
  amount: number;         // in NAIRA
  recipient: string;      // recipient_code from createTransferRecipient
  reference: string;
  reason?: string;
}): Promise<{ status: boolean; data: { transfer_code: string; status: string } }> {
  return paystackRequest('POST', '/transfer', {
    source:    'balance',
    amount:    Math.round(params.amount * 100),   // kobo
    recipient: params.recipient,
    reference: params.reference,
    reason:    params.reason ?? 'NoCut.ng withdrawal',
  });
}
