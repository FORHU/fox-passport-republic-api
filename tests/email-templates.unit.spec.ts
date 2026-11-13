import { describe, it, expect } from "vitest";
import { getHTMLContents } from "../src/utils/helpers";

/**
 * The code emails (api#335): every placeholder is filled, the address appears
 * only where it is meant to, and the logo is the inline `cid:` image. No
 * network.
 */

const email = "someone+test@example.com";
const OTP_CODE = "482913";

const render = (template_name: string) =>
  getHTMLContents({ template_name, email_data: { email, OTP_CODE } });

describe.each([
  ["verification-email.html", "Verify your email address", "Verification code"],
  ["forgot-password.html", "Reset your password", "Password reset code"],
])("%s", (template, heading, label) => {
  const html = render(template);

  it("fills every placeholder", () => {
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(html).toContain(OTP_CODE);
    expect(html).toContain(String(new Date().getFullYear()));
  });

  it("keeps its own words and shows the address once, in the sentence", () => {
    expect(html).toContain(`>${heading}</h1>`);
    expect(html).toContain(label);
    expect(html.split(email)).toHaveLength(2);
    expect(html).not.toContain(`${OTP_CODE}_EMAIL`);
  });

  it("shows the logo sent inside the email, not a data URI", () => {
    expect(html).toContain('src="cid:foxpassport-logo"');
    expect(html).not.toContain("data:image");
  });
});

describe("bare UPPER_CASE placeholders in older templates", () => {
  it("are replaced only as whole words", () => {
    const html = getHTMLContents({
      template_name: "booking-cancelled.html",
      email_data: {
        email,
        EVENT_NAME: "Garden $1 Party",
        BOOKING_ID: "b-1",
        REFUND_AMOUNT: "₱500",
        START_DATE: "Nov 20",
        TOTAL_PAID: "₱1,000",
      },
    });
    expect(html).toContain("Garden $1 Party");
    expect(html).not.toMatch(/\bEVENT_NAME\b/);
    expect(html).not.toContain(email);
  });
});
