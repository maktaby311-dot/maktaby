import { sendBrevoOtpEmail } from './brevo.ts';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('Brevo OTP request uses API-key auth and one recipient', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  await sendBrevoOtpEmail({
    apiKey: 'test-api-key',
    senderEmail: 'verified@example.com',
    senderName: 'Maktaby',
    to: 'person@example.com',
    code: '042681',
  }, async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response('{"messageId":"test-only"}', { status: 201 });
  });

  assert(capturedUrl === 'https://api.brevo.com/v3/smtp/email', 'unexpected endpoint');
  assert(capturedInit?.method === 'POST', 'expected POST');
  const headers = new Headers(capturedInit?.headers);
  assert(headers.get('api-key') === 'test-api-key', 'missing API-key header');
  const bodyText = String(capturedInit?.body || '');
  assert(!bodyText.includes('test-api-key'), 'API key leaked into request body');
  const body = JSON.parse(bodyText);
  assert(body.to.length === 1 && body.to[0].email === 'person@example.com', 'recipient mismatch');
  assert(body.textContent.includes('042681') && body.htmlContent.includes('042681'), 'OTP missing');
});

Deno.test('Brevo credentials are required before any request', async () => {
  let called = false;
  try {
    await sendBrevoOtpEmail({
      apiKey: '', senderEmail: 'verified@example.com', to: 'person@example.com', code: '042681',
    }, async () => {
      called = true;
      return new Response(null, { status: 201 });
    });
    throw new Error('expected missing configuration to fail');
  } catch (error) {
    assert(error instanceof Error && error.message === 'activation_provider_not_configured', 'wrong safe error');
  }
  assert(!called, 'request should not run without credentials');
});

Deno.test('Brevo provider failures stay generic and do not expose response content', async () => {
  try {
    await sendBrevoOtpEmail({
      apiKey: 'test-api-key', senderEmail: 'verified@example.com', to: 'person@example.com', code: '042681',
    }, async () => new Response('{"message":"private provider detail"}', { status: 401 }));
    throw new Error('expected provider failure');
  } catch (error) {
    if (!(error instanceof Error)) throw new Error('expected an Error');
    assert(error.message === 'activation_delivery_failed', 'failure was not sanitized');
    assert(!error.message.includes('private provider detail'), 'provider response leaked');
  }
});
