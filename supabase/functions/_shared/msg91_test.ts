import { sendMsg91Otp } from "./msg91.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("MSG91 sends the app-generated OTP with current v5 API parameters", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  await sendMsg91Otp({
    authKey: "test-auth-key",
    templateId: "template-123",
    to: "+201098765432",
    code: "042681",
  }, async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response('{"request_id":"test-only","type":"success"}', {
      status: 200,
    });
  });

  const url = new URL(capturedUrl);
  assert(url.origin === "https://control.msg91.com", "unexpected host");
  assert(url.pathname === "/api/v5/otp", "unexpected endpoint");
  assert(
    url.searchParams.get("template_id") === "template-123",
    "template ID missing",
  );
  assert(
    url.searchParams.get("mobile") === "201098765432",
    "number should be international digits",
  );
  assert(url.searchParams.get("otp") === "042681", "app OTP missing");
  assert(url.searchParams.get("otp_length") === "6", "OTP length mismatch");
  assert(url.searchParams.get("otp_expiry") === "10", "expiry mismatch");
  assert(
    url.searchParams.get("realTimeResponse") === "1",
    "real-time response should be enabled",
  );
  assert(capturedInit?.method === "POST", "expected POST");
  const headers = new Headers(capturedInit?.headers);
  assert(headers.get("authkey") === "test-auth-key", "missing authkey header");
  assert(
    !String(capturedInit?.body).includes("test-auth-key"),
    "auth key leaked into body",
  );
});

Deno.test("MSG91 is not contacted without credentials or template ID", async () => {
  for (
    const input of [
      {
        authKey: "",
        templateId: "template-123",
        to: "+201098765432",
        code: "042681",
      },
      {
        authKey: "test-auth-key",
        templateId: "",
        to: "+201098765432",
        code: "042681",
      },
    ]
  ) {
    let called = false;
    try {
      await sendMsg91Otp(input, async () => {
        called = true;
        return new Response('{"type":"success"}', { status: 200 });
      });
      throw new Error("expected missing configuration to fail");
    } catch (error) {
      assert(
        error instanceof Error &&
          error.message === "activation_provider_not_configured",
        "wrong safe error",
      );
    }
    assert(!called, "provider request should not run without configuration");
  }
});

Deno.test("MSG91 rejects invalid inputs before making a request", async () => {
  let called = false;
  try {
    await sendMsg91Otp({
      authKey: "test-auth-key",
      templateId: "template-123",
      to: "01098765432",
      code: "12345",
    }, async () => {
      called = true;
      return new Response('{"type":"success"}', { status: 200 });
    });
    throw new Error("expected invalid input to fail");
  } catch (error) {
    assert(
      error instanceof Error && error.message === "activation_delivery_failed",
      "wrong input failure",
    );
  }
  assert(!called, "provider request should not run for invalid inputs");
});

Deno.test("MSG91 type:error is failure even with HTTP 200 and details are sanitized", async () => {
  try {
    await sendMsg91Otp(
      {
        authKey: "test-auth-key",
        templateId: "template-123",
        to: "+201098765432",
        code: "042681",
      },
      async () =>
        new Response('{"message":"private provider detail","type":"error"}', {
          status: 200,
        }),
    );
    throw new Error("expected provider failure");
  } catch (error) {
    if (!(error instanceof Error)) throw new Error("expected an Error");
    assert(
      error.message === "activation_delivery_failed",
      "failure was not sanitized",
    );
    assert(
      !error.message.includes("private provider detail"),
      "provider response leaked",
    );
  }
});

Deno.test("MSG91 rejects HTTP errors and network errors without retrying", async () => {
  const fetchers: Array<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  > = [
    async () => new Response('{"type":"success"}', { status: 401 }),
    async () => {
      throw new Error("network detail");
    },
  ];
  for (const fetcher of fetchers) {
    let calls = 0;
    try {
      await sendMsg91Otp({
        authKey: "test-auth-key",
        templateId: "template-123",
        to: "+201098765432",
        code: "042681",
      }, async (input, init) => {
        calls++;
        return await fetcher(input, init);
      });
      throw new Error("expected provider failure");
    } catch (error) {
      assert(
        error instanceof Error &&
          error.message === "activation_delivery_failed",
        "failure was not sanitized",
      );
    }
    assert(calls === 1, "must not retry potentially billable requests");
  }
});
