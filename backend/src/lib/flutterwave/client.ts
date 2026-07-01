import https from 'https';
import {
  FlutterwaveInitializeResponse,
  FlutterwaveTransactionData,
} from '../../types';

const BASE_URL = 'api.flutterwave.com';

function flutterwaveRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;

    const options: https.RequestOptions = {
      hostname: BASE_URL,
      port: 443,
      path: `/v3${path}`,
      method,
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
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
          reject(new Error(`Flutterwave response parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Initialise a Flutterwave hosted checkout. Returns a payment link. */
export async function initializePayment(params: {
  email: string;
  name: string;
  amount: number;          // in NAIRA
  tx_ref: string;
  redirect_url: string;
  metadata?: Record<string, unknown>;
}): Promise<FlutterwaveInitializeResponse> {
  return flutterwaveRequest<FlutterwaveInitializeResponse>('POST', '/payments', {
    tx_ref:       params.tx_ref,
    amount:       params.amount,
    currency:     'NGN',
    redirect_url: params.redirect_url,
    customer: {
      email: params.email,
      name:  params.name,
    },
    customizations: {
      title:       'NoCut.ng',
      description: 'Wallet deposit',
    },
    meta: params.metadata ?? {},
  });
}

/** Verify a transaction by Flutterwave's internal transaction id (from webhook payload). */
export async function verifyTransaction(
  transactionId: number | string
): Promise<{ status: string; data: FlutterwaveTransactionData }> {
  return flutterwaveRequest('GET', `/transactions/${transactionId}/verify`);
}

/** Resolve a bank account number — used in withdrawal flow to confirm account name. */
export async function resolveAccount(params: {
  account_number: string;
  account_bank: string;     // Flutterwave bank code
}): Promise<{ status: string; data: { account_number: string; account_name: string } }> {
  return flutterwaveRequest('POST', '/accounts/resolve', {
    account_number: params.account_number,
    account_bank:   params.account_bank,
  });
}

/** List Nigerian banks supported by Flutterwave. */
export async function listBanks(): Promise<{
  status: string;
  data: Array<{ id: number; code: string; name: string }>;
}> {
  return flutterwaveRequest('GET', '/banks/NG');
}

/** Initiate a Flutterwave transfer (payout) for an approved withdrawal. */
export async function initiateTransfer(params: {
  account_bank: string;
  account_number: string;
  amount: number;           // in NAIRA
  reference: string;
  narration?: string;
  beneficiary_name?: string;
}): Promise<{ status: string; data: { id: number; reference: string; status: string } }> {
  return flutterwaveRequest('POST', '/transfers', {
    account_bank:     params.account_bank,
    account_number:   params.account_number,
    amount:           params.amount,
    currency:         'NGN',
    reference:        params.reference,
    narration:        params.narration ?? 'NoCut.ng withdrawal',
    beneficiary_name: params.beneficiary_name,
  });
}
