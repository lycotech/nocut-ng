// Email service — console output in development, real SMTP in production.
// Replace the sendMail body with nodemailer/Resend/Mailgun when going live.

const isDev = process.env.NODE_ENV !== 'production';

export async function sendOtpEmail(to: string, otp: string, purpose: string): Promise<void> {
  const subject = purpose === 'reset_password'
    ? 'NoCut.ng — Reset your password'
    : 'NoCut.ng — Verify your email';

  const body = purpose === 'reset_password'
    ? `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request a reset, ignore this email.`
    : `Your NoCut.ng verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nDon't Guess. Take Position.`;

  if (isDev) {
    console.log('\n─────────────────────────────────────────');
    console.log(`[EMAIL] To: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    console.log(`[EMAIL] OTP: ${otp}`);
    console.log('─────────────────────────────────────────\n');
    return;
  }

  // TODO: replace with real email provider before production
  // Example with nodemailer:
  // const transporter = nodemailer.createTransport({ ... });
  // await transporter.sendMail({ from: 'noreply@nocut.ng', to, subject, text: body });
  console.warn('[EMAIL] Production email not configured — OTP not sent to', to);
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (isDev) {
    console.log('\n─────────────────────────────────────────');
    console.log(`[SMS] To: ${phone}`);
    console.log(`[SMS] OTP: ${otp}`);
    console.log('─────────────────────────────────────────\n');
    return;
  }

  // TODO: replace with Twilio or Termii (Nigerian SMS provider) before production
  console.warn('[SMS] Production SMS not configured — OTP not sent to', phone);
}
