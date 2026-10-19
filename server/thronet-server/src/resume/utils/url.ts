/**
 * Turns any input into either a valid, absolute URL string or an empty string.
 * Used to sanitize link-type fields (linkedIn, github, portfolio, project links)
 * coming from PDF parsing, where hyperlink text (e.g. from LaTeX/Overleaf PDFs)
 * often isn't a real URL — it's just a label like "LinkedIn" or a bare domain
 * without a scheme.
 */
export const toSafeUrl = (value: unknown): string => {
  if (typeof value !== "string") return "";

  const trimmed = value.trim().replace(/[),.;]+$/, "");
  if (!trimmed) return "";

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
};
