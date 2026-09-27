import { head } from '@vercel/blob';
import { db } from '@/lib/db';
import { HttpError, blobToken, cleanName, readJson, requireUser, run, uuid } from '@/lib/api';

/** Records a file that the browser has just uploaded to Vercel Blob. */
export async function POST(req: Request) {
  return run(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const pageId = uuid(body.pageId);
    const pathname = String(body.pathname ?? '');
    if (!pathname.startsWith(`${user.id}/${pageId}/`)) throw new HttpError(400, 'Invalid file');

    const blob = await head(pathname, { token: blobToken() }).catch((error) => {
      console.error('Blob head failed', error);
      return null;
    });
    if (!blob) throw new HttpError(400, 'Uploaded file not found');

    const rows = await db()`
      insert into attachments (page_id, user_id, name, size, content_type, blob_url, pathname)
      select id, user_id, ${cleanName(body.name, 'file')}, ${blob.size},
             ${blob.contentType || 'application/octet-stream'}, ${blob.url}, ${blob.pathname}
      from pages where id = ${pageId} and user_id = ${user.id}
      returning id, name, size, content_type, created_at`;
    if (!rows.length) throw new HttpError(404, 'Page not found');
    return Response.json(rows[0]);
  });
}
