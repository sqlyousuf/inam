import bcrypt from 'bcryptjs';
import { createSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { HttpError, readJson, run } from '@/lib/api';

// Compared against when the email is unknown, so both cases take similar time.
const DUMMY_HASH = '$2b$12$VGC0EAKdXA2Yq7j4WXJ7ierkV7pKWAl.LyKo4mKxhP84yBrvazcPi';

export async function POST(req: Request) {
  return run(async () => {
    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    const rows = await db()`select id, email, password_hash from users where email = ${email}`;
    const user = rows[0];
    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, 'Incorrect email or password');

    await createSession({ id: user.id, email: user.email });
    return Response.json({ ok: true });
  });
}
