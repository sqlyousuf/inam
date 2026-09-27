import bcrypt from 'bcryptjs';
import { createSession, signupAllowed } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, readJson, run } from '@/lib/api';

export async function POST(req: Request) {
  return run(async () => {
    if (!(await signupAllowed())) throw new HttpError(403, 'Sign-up is disabled');

    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
    if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const hash = await bcrypt.hash(password, 12);
    const rows = await db()`
      insert into users (email, password_hash) values (${email}, ${hash})
      on conflict (email) do nothing
      returning id, email`;
    if (!rows.length) throw new HttpError(409, 'An account with that email already exists');

    await createSession({ id: rows[0].id, email: rows[0].email });
    return Response.json({ ok: true });
  });
}
