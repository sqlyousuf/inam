import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';

const COOKIE = 'session';
// Browsers cap cookies at 400 days; the session renews itself daily while in use,
// so you stay signed in until you sign out.
const MAX_AGE = 60 * 60 * 24 * 400;
const RENEW_AFTER = 60 * 60 * 24;

export type User = { id: string; email: string };

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random string of at least 32 characters');
  }
  return new TextEncoder().encode(value);
}

export async function createSession(user: User) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

async function readSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return { user: { id: payload.sub, email: payload.email } as User, issuedAt: payload.iat ?? 0 };
  } catch {
    return null;
  }
}

export async function getUser(): Promise<User | null> {
  return (await readSession())?.user ?? null;
}

/** Like getUser, but also renews the session once a day. Only usable in route handlers. */
export async function getUserAndRenew(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;
  if (Date.now() / 1000 - session.issuedAt > RENEW_AFTER) await createSession(session.user);
  return session.user;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Sign-up is open until the first account exists, or always when ALLOW_SIGNUP=true. */
export async function signupAllowed() {
  if (process.env.ALLOW_SIGNUP === 'true') return true;
  const rows = await db()`select exists(select 1 from users) as has_users`;
  return !rows[0].has_users;
}
