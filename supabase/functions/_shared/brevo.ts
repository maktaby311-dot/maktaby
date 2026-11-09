export type BrevoOtpEmailInput = {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  to: string;
  code: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] || char));
}

/** Sends one transactional activation code; never logs or returns credentials or provider details. */
export async function sendBrevoOtpEmail(
  input: BrevoOtpEmailInput,
  fetcher: typeof fetch = fetch,
) {
  const apiKey = input.apiKey.trim();
  const senderEmail = input.senderEmail.trim();
  const senderName = (input.senderName || 'مكتبي الإلكتروني').trim();
  const to = input.to.trim();

  if (!apiKey || !EMAIL_RE.test(senderEmail) || /[\r\n]/.test(senderEmail) ||
      !senderName || senderName.length > 70 || /[\r\n]/.test(senderName)) {
    throw new Error('activation_provider_not_configured');
  }
  if (!EMAIL_RE.test(to) || !/^\d{6}$/.test(input.code)) {
    throw new Error('activation_delivery_failed');
  }

  const safeCode = escapeHtml(input.code);
  const textContent = `رمز تفعيل حسابك: ${input.code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد. إذا لم تطلبه فتجاهل هذه الرسالة.`;
  const htmlContent = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body><p>رمز تفعيل حسابك في مكتبي الإلكتروني:</p><p style="font-size:24px;font-weight:bold;letter-spacing:3px">${safeCode}</p><p>صالح لمدة 10 دقائق. لا تشاركه مع أحد. إذا لم تطلبه فتجاهل هذه الرسالة.</p></body></html>`;
  const response = await fetcher(ENDPOINT, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: to }],
      subject: 'رمز تفعيل حساب مكتبي',
      textContent,
      htmlContent,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error('activation_delivery_failed');
}
