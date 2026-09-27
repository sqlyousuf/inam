import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { db } from '@/lib/db';
import { HttpError, blobToken, readJson, requireUser, run, uuid } from '@/lib/api';

/**
 * Issues a short-lived token so the browser can upload one file straight to Vercel Blob
 * (this avoids the 4.5 MB request limit on Vercel functions).
 */
export async function POST(req: Request) {
  return run(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const pageId = uuid(body.pageId);
    const pathname = String(body.pathname ?? '');
    if (!pathname.startsWith(`${user.id}/${pageId}/`)) throw new HttpError(400, 'Invalid upload path');

    const token = blobToken();
    if (!token) {
      throw new HttpError(
        500,
        'File storage is not set up: BLOB_READ_WRITE_TOKEN is missing. In Vercel, open Storage, ' +
          'connect your Blob store to this project (or copy its BLOB_READ_WRITE_TOKEN into ' +
          'Settings → Environment Variables), then redeploy.',
      );
    }

    const rows = await db()`select 1 from pages where id = ${pageId} and user_id = ${user.id}`;
    if (!rows.length) throw new HttpError(404, 'Page not found');

    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      addRandomSuffix: true,
      maximumSizeInBytes: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024,
      validUntil: Date.now() + 60 * 60 * 1000,
    });
    return Response.json({ clientToken });
  });
}
