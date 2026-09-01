import { cookies } from "next/headers";
import { query } from "./db";
import { SESSION_COOKIE, verifyToken, type SessionData } from "./session";

/** Verify username/password against bcrypt hashes stored via pgcrypto. */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<{ uid: string; username: string; role: string } | null> {
  const rows = await query<{ id: string; username: string; role: string }>(
    `SELECT id, username, role FROM master.users
     WHERE username = $1 AND status = 'ACTIVE'
       AND password_hash = crypt($2, password_hash)`,
    [username, password],
  );
  if (rows.length === 0) return null;
  return { uid: rows[0].id, username: rows[0].username, role: rows[0].role };
}

/** Read and validate the current session from the request cookie. */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function isAdmin(session: SessionData | null): boolean {
  return session?.role === "ADMIN";
}

/** Throws when the caller is not an authenticated admin. */
export async function requireAdmin(): Promise<SessionData> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  if (session.role !== "ADMIN") throw new Error("Admin privileges required.");
  return session;
}

export async function requireUser(): Promise<SessionData> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  return session;
}
