import { UAParser } from "ua-parser-js";

export function getVisitorInfo(userAgent: string) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    browser: result.browser.name || "Unknown",
    browserVersion: result.browser.version || "",

    device:
      `${result.device.vendor || ""} ${result.device.model || ""}`.trim() ||
      result.device.type ||
      "Desktop",

    os: result.os.name || "Unknown",

    isMobile: ["mobile", "tablet"].includes(
      result.device.type || ""
    ),

    isBot: /bot|crawler|spider|scraper/i.test(userAgent),

    userAgent,
  };
}