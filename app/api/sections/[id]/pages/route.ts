import { db } from '@/lib/db';
import { requireUser, run, uuid } from '@/lib/api';

type Params = { params: Promise<{ id: string }> };

/** Page list for a section (without page content). */
export async function GET(_req: Request, { params }: Params) {
  return run(async () => {
    const user = await requireUser();
    const id = uuid((await params).id);
    const rows = await db()`
      select id, title, updated_at from pages
      where section_id = ${id} and user_id = ${user.id}
      order by created_at`;
    return Response.json(rows);
  });
}
