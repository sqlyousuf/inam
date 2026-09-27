import { get } from '@vercel/blob';
import { db } from '@/lib/db';
import { HttpError, blobAccess, blobToken, isInlineImage, requireUser, run, uuid } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const IMAGE_SRC = /\/api\/attachments\/([0-9a-f-]{36})\?inline=1/gi;

/** Replaces links to pasted images with the image data, so the file works offline. */
async function embedImages(html: string, userId: string) {
  const ids = [...new Set([...html.matchAll(IMAGE_SRC)].map((m) => m[1]))];
  if (!ids.length) return html;
  const rows = await db()`
    select id, content_type, blob_url from attachments where user_id = ${userId} and id = any(${ids}::uuid[])`;
  const dataUrls = new Map<string, string>();
  for (const row of rows) {
    if (!isInlineImage(row.content_type)) continue;
    const result = await get(row.blob_url, { access: blobAccess(), token: blobToken() }).catch(() => null);
    if (!result || result.statusCode !== 200) continue;
    const bytes = Buffer.from(await new Response(result.stream).arrayBuffer());
    dataUrls.set(row.id, `data:${row.content_type};base64,${bytes.toString('base64')}`);
  }
  return html.replace(IMAGE_SRC, (match, id: string) => dataUrls.get(id) ?? match);
}

/** Downloads a page as a standalone HTML file. */
export async function GET(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const rows = await db()`
      select title, content, updated_at from pages where id = ${id} and user_id = ${user.id}`;
    if (!rows.length) throw new HttpError(404, 'Page not found');
    const page = rows[0];
    const title = escapeHtml(page.title || 'Untitled page');

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;line-height:1.6}pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#555}img{max-width:100%;height:auto}</style>
</head>
<body>
<h1>${title}</h1>
<p style="color:#777">Last edited ${new Date(page.updated_at).toUTCString()}</p>
${await embedImages(page.content, user.id)}
</body>
</html>`;

    const fileName = (page.title || 'page').replace(/[^\w\- ]+/g, '').trim() || 'page';
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.html"`,
      },
    });
  });
}
