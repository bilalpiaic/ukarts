export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as readonly string[]).includes(value);
}

/** Designated serial starting points for each account type (standard COA). */
export const ACCOUNT_CODE_BASES: Record<AccountType, number> = {
  ASSET: 1000,
  LIABILITY: 2000,
  EQUITY: 3000,
  INCOME: 4000,
  EXPENSE: 5000,
};

export const ACCOUNT_CODE_RANGE = 1000;
export const SERIAL_POINT_STEP = 100;
/** Sentinel: open the next unused hundred-based serial point in the type range. */
export const NEW_SERIES = "__new__";

export function parseAccountCode(code: string): number | null {
  const trimmed = code.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function isDesignatedSerialPoint(code: string): boolean {
  const n = parseAccountCode(code);
  return n !== null && n % SERIAL_POINT_STEP === 0;
}

function takenInRange(existing: string[], min: number, maxExclusive: number): Set<number> {
  const taken = new Set<number>();
  for (const code of existing) {
    const n = parseAccountCode(code);
    if (n !== null && n >= min && n < maxExclusive) taken.add(n);
  }
  return taken;
}

export function typeRange(type: AccountType): { base: number; limit: number } {
  const base = ACCOUNT_CODE_BASES[type];
  return { base, limit: base + ACCOUNT_CODE_RANGE };
}

/** Next unused child serial under a designated point (e.g. 1000 → 1001). */
export function nextChildSerial(existingCodes: string[], serialBase: string): string {
  const base = parseAccountCode(serialBase);
  if (base === null || base % SERIAL_POINT_STEP !== 0) {
    throw new Error("Serial point must be a designated hundred-based account code.");
  }
  const limit = base + SERIAL_POINT_STEP;
  const taken = takenInRange(existingCodes, base, limit);
  for (let n = base + 1; n < limit; n++) {
    if (!taken.has(n)) return String(n);
  }
  throw new Error(`No free serials left under ${serialBase} (${base + 1}–${limit - 1}).`);
}

/** Next unused designated serial point (xx00) in the type's thousand-block. */
export function nextSeriesPoint(existingCodes: string[], type: AccountType): string {
  const { base, limit } = typeRange(type);
  const taken = takenInRange(existingCodes, base, limit);
  for (let n = base; n < limit; n += SERIAL_POINT_STEP) {
    if (!taken.has(n)) return String(n);
  }
  throw new Error(`No free ${type} serial points left in ${base}–${limit - 1}.`);
}

/**
 * Allocate the next COA code.
 * - `serialBase` omitted / `__new__` → next unused xx00 in the type range.
 * - otherwise serialise from that designated point (base+1, base+2, …).
 */
export function allocateAccountCode(
  existingCodes: string[],
  type: AccountType,
  serialBase?: string | null,
): string {
  const base = (serialBase ?? "").trim();
  if (!base || base === NEW_SERIES) {
    return nextSeriesPoint(existingCodes, type);
  }
  const n = parseAccountCode(base);
  if (n === null) {
    throw new Error("Serial point must be a numeric account code.");
  }
  const { base: typeBase, limit } = typeRange(type);
  if (n < typeBase || n >= limit) {
    throw new Error(`${base} is outside the ${type} series (${typeBase}–${limit - 1}).`);
  }
  if (n % SERIAL_POINT_STEP !== 0) {
    throw new Error("Serial point must be a designated hundred-based account code.");
  }
  return nextChildSerial(existingCodes, String(n));
}

export interface SerialAccount {
  account_code: string;
  account_name: string;
  account_type: string;
}

export interface SerialOption {
  value: string;
  label: string;
  nextCode: string | null;
  error?: string;
}

export function serialOptionsForType(
  accounts: SerialAccount[],
  type: AccountType,
): SerialOption[] {
  const existing = accounts.map((a) => a.account_code);
  const points = accounts
    .filter((a) => a.account_type === type && isDesignatedSerialPoint(a.account_code))
    .sort((a, b) => a.account_code.localeCompare(b.account_code, undefined, { numeric: true }));

  const options: SerialOption[] = [];
  for (const p of points) {
    try {
      const next = nextChildSerial(existing, p.account_code);
      options.push({
        value: p.account_code,
        label: `${p.account_code} · ${p.account_name} → ${next}`,
        nextCode: next,
      });
    } catch (err) {
      options.push({
        value: p.account_code,
        label: `${p.account_code} · ${p.account_name} (full)`,
        nextCode: null,
        error: (err as Error).message,
      });
    }
  }

  try {
    const next = nextSeriesPoint(existing, type);
    options.push({
      value: NEW_SERIES,
      label: `New ${type.toLowerCase()} series → ${next}`,
      nextCode: next,
    });
  } catch (err) {
    options.push({
      value: NEW_SERIES,
      label: `New ${type.toLowerCase()} series (full)`,
      nextCode: null,
      error: (err as Error).message,
    });
  }
  return options;
}

/** Prefer the type's designated base (1000, 2000, …) when it already exists. */
export function defaultSerialBase(accounts: SerialAccount[], type: AccountType): string {
  const designated = String(ACCOUNT_CODE_BASES[type]);
  const has = accounts.some(
    (a) => a.account_type === type && a.account_code === designated,
  );
  return has ? designated : NEW_SERIES;
}
