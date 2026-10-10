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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Print date as dd-mmm-yy (08-Oct-26). ISO dates are split so the day does not shift by timezone. */
export function formatDocDate(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return raw;
  return `${match[3]}-${month}-${match[1].slice(-2)}`;
}

/** Date and time printed at the top of a document, for example 10-Oct-26, 3:07 PM. */
export function formatPrintStamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTHS[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hour24 = date.getHours();
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${day}-${month}-${year}, ${hour12}:${minutes} ${suffix}`;
}
