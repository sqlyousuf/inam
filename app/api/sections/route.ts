import { db } from '@/lib/db';
import { HttpError, cleanName, readJson, requireUser, run, uuid } from '@/lib/api';

export async function POST(req: Request) {
  return run(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const notebookId = uuid(body.notebookId);
    const rows = await db()`
      insert into sections (notebook_id, user_id, name)
      select id, user_id, ${cleanName(body.name, 'New section')} from notebooks
      where id = ${notebookId} and user_id = ${user.id}
      returning id, name`;
    if (!rows.length) throw new HttpError(404, 'Notebook not found');
    return Response.json(rows[0]);
  });
}
