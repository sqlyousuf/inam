import { del } from '@vercel/blob';
import { getUser } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Runs a route handler body and turns thrown errors into JSON responses. */
export async function run(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: 'Something went wrong on the server' }, { status: 500 });
  }
}

export async function requireUser() {
  const user = await getUser();
  if (!user) throw new HttpError(401, 'Not signed in');
  return user;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(value: unknown) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(404, 'Not found');
  return value;
}

export function cleanName(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim().slice(0, 200) : '';
  return text || fallback;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new HttpError(400, 'Invalid request body');
  }
}

/** Finds the Blob read-write token, including prefixed names like STORAGE_READ_WRITE_TOKEN. */
export function blobToken() {
  const env = process.env;
  if (env.BLOB_READ_WRITE_TOKEN) return env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(env).find((k) => k.endsWith('_READ_WRITE_TOKEN') && env[k]?.startsWith('vercel_blob_rw_'));
  return key ? env[key] : undefined;
}

export function blobAccess(): 'private' | 'public' {
  return process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
}

/** Deletes stored files; failures are logged, not fatal. */
export async function deleteBlobs(rows: Record<string, unknown>[]) {
  const urls = rows.map((row) => row.blob_url as string).filter(Boolean);
  if (!urls.length) return;
  try {
    await del(urls, { token: blobToken() });
  } catch (error) {
    console.error('Failed to delete blobs', error);
  }
}
