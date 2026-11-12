export type Msg91OtpInput = {
  authKey: string;
  templateId: string;
  to: string;
  code: string;
};

const ENDPOINT = "https://control.msg91.com/api/v5/otp";
const E164_RE = /^\+[1-9]\d{7,14}$/;

/**
 * Deliver the activation service's own six-digit code through MSG91 SendOTP.
 * The app keeps ownership of expiry, rate limiting, one-time use and verification;
 * MSG91 only delivers the code. Never log the auth key, phone, OTP or provider body.
 */
export async function sendMsg91Otp(
  input: Msg91OtpInput,
  fetcher: typeof fetch = fetch,
) {
  const authKey = input.authKey.trim();
  const templateId = input.templateId.trim();
  const to = input.to.trim();

  if (
    !authKey || !templateId || /[\r\n]/.test(authKey) ||
    /[\r\n]/.test(templateId)
  ) {
    throw new Error("activation_provider_not_configured");
  }
  if (!E164_RE.test(to) || !/^\d{6}$/.test(input.code)) {
    throw new Error("activation_delivery_failed");
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("template_id", templateId);
  url.searchParams.set("mobile", to.slice(1));
  url.searchParams.set("otp", input.code);
  url.searchParams.set("otp_length", "6");
  url.searchParams.set("otp_expiry", "10");
  url.searchParams.set("realTimeResponse", "1");

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authkey: authKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("activation_delivery_failed");
  }

  let result: { type?: unknown } | null = null;
  try {
    result = await response.json();
  } catch {
    // Treat malformed provider responses as delivery failures without exposing their body.
  }
  if (!response.ok || !result || result.type !== "success") {
    throw new Error("activation_delivery_failed");
  }
}
