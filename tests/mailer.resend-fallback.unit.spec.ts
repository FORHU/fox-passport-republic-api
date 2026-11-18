import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * api#332: Resend reports a refused email in `error` instead of throwing. The
 * mailer must treat that as a failure and send through SMTP. No network.
 */

const resendSend = vi.hoisted(() => vi.fn());
const smtpSend = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));
vi.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: smtpSend }),
  getTestMessageUrl: () => false,
}));

// The key is read from the environment when the mailer module loads, as on
// the server, so the module is imported fresh after setting it.
const loadMailer = async () => {
  vi.resetModules();
  process.env.RESEND_API_KEY = "re_test";
  return import("../src/utils/mailer");
};

const mail = { to: "someone@example.com", subject: "Code", html: "<p>1</p>" };

describe("sendEmail with a Resend key", () => {
  afterAll(() => {
    delete process.env.RESEND_API_KEY;
  });

  beforeEach(() => {
    resendSend.mockReset();
    smtpSend.mockReset().mockResolvedValue({ response: "250 OK" });
  });

  it("uses Resend alone when Resend accepts the email", async () => {
    resendSend.mockResolvedValue({ data: { id: "e1" }, error: null });

    await expect((await loadMailer()).sendEmail(mail)).resolves.toBe(
      "Email sent successfully",
    );
    expect(smtpSend).not.toHaveBeenCalled();
  });

  it("falls back to SMTP when Resend returns an error", async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "domain not verified" },
    });

    await expect((await loadMailer()).sendEmail(mail)).resolves.toBe(
      "Email sent successfully",
    );
    expect(smtpSend).toHaveBeenCalledOnce();
    expect(smtpSend.mock.calls[0][0]).toMatchObject({
      to: mail.to,
      subject: mail.subject,
    });
  });

  it("falls back to SMTP when Resend throws", async () => {
    resendSend.mockRejectedValue(new Error("network"));

    await (await loadMailer()).sendEmail(mail);
    expect(smtpSend).toHaveBeenCalledOnce();
  });
});
