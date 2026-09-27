import { db } from '@/lib/db';
import { HttpError, deleteBlobs, readJson, requireUser, run, uuid } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

const MAX_CONTENT = 2_000_000; // characters of HTML per page

/** A page with its content and attachments. */
export async function GET(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const rows = await db()`
      select id, title, content, updated_at from pages where id = ${id} and user_id = ${user.id}`;
    if (!rows.length) throw new HttpError(404, 'Page not found');
    const attachments = await db()`
      select id, name, size, content_type, created_at from attachments
      where page_id = ${id} and user_id = ${user.id} and not inline order by created_at`;
    return Response.json({ ...rows[0], attachments });
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const body = await readJson(req);
    const title = typeof body.title === 'string' ? body.title.slice(0, 300) : null;
    const content = typeof body.content === 'string' ? body.content : null;
    if (content && content.length > MAX_CONTENT) {
      throw new HttpError(413, 'This page is too large to save');
    }
    const rows = await db()`
      update pages set
        title = coalesce(${title}, title),
        content = coalesce(${content}, content),
        updated_at = now()
      where id = ${id} and user_id = ${user.id}
      returning id, title, updated_at`;
    if (!rows.length) throw new HttpError(404, 'Page not found');
    return Response.json(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const files = await db()`
      select blob_url from attachments where page_id = ${id} and user_id = ${user.id}`;
    const rows = await db()`delete from pages where id = ${id} and user_id = ${user.id} returning id`;
    if (!rows.length) throw new HttpError(404, 'Page not found');
    await deleteBlobs(files);
    return Response.json({ ok: true });
  });
}
