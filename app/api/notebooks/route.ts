import { db } from '@/lib/db';
import { cleanName, readJson, requireUser, run } from '@/lib/api';

type Section = { id: string; name: string };

/** All notebooks with their sections. */
export async function GET() {
  return run(async () => {
    const user = await requireUser();
    const notebooks = await db()`
      select id, name from notebooks where user_id = ${user.id} order by created_at`;
    const sections = await db()`
      select id, notebook_id, name from sections where user_id = ${user.id} order by created_at`;

    const byNotebook = new Map<string, Section[]>();
    for (const s of sections) {
      const list = byNotebook.get(s.notebook_id) ?? [];
      list.push({ id: s.id, name: s.name });
      byNotebook.set(s.notebook_id, list);
    }
    return Response.json(
      notebooks.map((n) => ({ id: n.id, name: n.name, sections: byNotebook.get(n.id) ?? [] })),
    );
  });
}

/** Creates a notebook with one starter section. */
export async function POST(req: Request) {
  return run(async () => {
    const user = await requireUser();
    const body = await readJson(req);
    const [notebook] = await db()`
      insert into notebooks (user_id, name) values (${user.id}, ${cleanName(body.name, 'New notebook')})
      returning id, name`;
    const [section] = await db()`
      insert into sections (notebook_id, user_id, name) values (${notebook.id}, ${user.id}, 'New section')
      returning id, name`;
    return Response.json({ ...notebook, sections: [section] });
  });
}
