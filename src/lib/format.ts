export const money = (v: number | string) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const qty = (v: number | string) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Display a calendar date as `dd-mmm-yy`, for example `08-Oct-26`. */
export function formatDate(value: string | Date | null | undefined): string {
  const iso = parseDate(value);
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y.slice(-2)}`;
}

/**
 * Accept `YYYY-MM-DD`, `dd-mmm-yy`, `dd-mmm-yyyy`, `dd-mm-yy`, or `dd-mm-yyyy`
 * and return `YYYY-MM-DD`. Two-digit years are 2000–2099.
 */
export function parseDate(value: string | Date | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const named = text.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/);
  if (named) {
    const month = MONTHS.findIndex((m) => m.toLowerCase() === named[2].toLowerCase()) + 1;
    if (!month) return null;
    return isoFromParts(expandYear(named[3]), month, Number(named[1]));
  }
  const numeric = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (numeric) return isoFromParts(expandYear(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  return null;
}

export function todayIso(): string {
  const now = new Date();
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate()) ?? "";
}

function expandYear(year: string): number {
  const n = Number(year);
  return year.length === 2 ? 2000 + n : n;
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
