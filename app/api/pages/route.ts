import { db } from '@/lib/db';
import { HttpError, readJson, requireUser, run, uuid } from '@/lib/api';

export async function POST(req: Request) {
  return run(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const sectionId = uuid(body.sectionId);
    const rows = await db()`
      insert into pages (section_id, user_id)
      select id, user_id from sections where id = ${sectionId} and user_id = ${user.id}
      returning id, title, updated_at`;
    if (!rows.length) throw new HttpError(404, 'Section not found');
    return Response.json(rows[0]);
  });
}
