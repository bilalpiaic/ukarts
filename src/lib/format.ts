/** Money picture: millions and thousands, two decimals. `000,000,000.00` is 14 characters. */
export const MONEY_PICTURE = "000,000,000.00";

const INTEGER_DIGITS = 9;
const FRACTION_DIGITS = 2;

/** Display a figure as `1,234,567.89` (thousand groups, always two decimals). */
export const money = (v: number | string) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return "0.00";
  const sign = n < 0 ? "-" : "";
  const [int, frac] = Math.abs(n).toFixed(FRACTION_DIGITS).split(".");
  return sign + groupThousands(int) + "." + frac;
};

export const qty = (v: number | string) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

/** Canonical amount while typing: digits, one dot, at most two decimals, nine integer digits. */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/,/g, "").replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  let intPart = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "");
  const frac = dot === -1 ? "" : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, FRACTION_DIGITS);
  if (intPart.length > INTEGER_DIGITS) intPart = intPart.slice(0, INTEGER_DIGITS);
  if (dot === -1) return intPart;
  return `${intPart || "0"}.${frac}`;
}

/** Insert thousand separators into a canonical amount, keeping a trailing dot while typing. */
export function groupAmountInput(canonical: string): string {
  if (!canonical) return "";
  const dot = canonical.indexOf(".");
  const intPart = dot === -1 ? canonical : canonical.slice(0, dot);
  const grouped = groupThousands(intPart || "0");
  if (dot === -1) return grouped;
  return `${grouped}.${canonical.slice(dot + 1)}`;
}

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
