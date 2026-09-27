import { db } from '@/lib/db';
import { HttpError, cleanName, deleteBlobs, readJson, requireUser, run, uuid } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const body = await readJson(req);
    const rows = await db()`
      update notebooks set name = ${cleanName(body.name, 'Untitled notebook')}
      where id = ${id} and user_id = ${user.id} returning id, name`;
    if (!rows.length) throw new HttpError(404, 'Notebook not found');
    return Response.json(rows[0]);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const files = await db()`
      select a.blob_url from attachments a
      join pages p on p.id = a.page_id
      join sections s on s.id = p.section_id
      where s.notebook_id = ${id} and a.user_id = ${user.id}`;
    const rows = await db()`delete from notebooks where id = ${id} and user_id = ${user.id} returning id`;
    if (!rows.length) throw new HttpError(404, 'Notebook not found');
    await deleteBlobs(files);
    return Response.json({ ok: true });
  });
}
