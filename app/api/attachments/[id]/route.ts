import { get } from '@vercel/blob';
import { db } from '@/lib/db';
import { HttpError, blobAccess, blobToken, deleteBlobs, isInlineImage, requireUser, run, uuid } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/**
 * Downloads a file. Only the owner can fetch it; the storage URL is never exposed.
 * With ?inline=1, images are served for display inside a page.
 */
export async function GET(req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const rows = await db()`
      select name, content_type, blob_url from attachments where id = ${id} and user_id = ${user.id}`;
    if (!rows.length) throw new HttpError(404, 'File not found');
    const file = rows[0];

    const result = await get(file.blob_url, { access: blobAccess(), token: blobToken() });
    if (!result || result.statusCode !== 200) throw new HttpError(404, 'File is missing from storage');

    const inline = new URL(req.url).searchParams.get('inline') === '1' && isInlineImage(file.content_type);
    const encoded = encodeURIComponent(file.name);
    const ascii = file.name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    return new Response(result.stream, {
      headers: {
        'Content-Type': inline ? file.content_type : 'application/octet-stream',
        'Content-Length': String(result.blob.size),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`,
        'X-Content-Type-Options': 'nosniff',
        // Stored files never change, so the browser may keep images it has already shown.
        'Cache-Control': inline ? 'private, max-age=31536000, immutable' : 'private, no-store',
      },
    });
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const rows = await db()`
      delete from attachments where id = ${id} and user_id = ${user.id} returning blob_url`;
    if (!rows.length) throw new HttpError(404, 'File not found');
    await deleteBlobs(rows);
    return Response.json({ ok: true });
  });
}
