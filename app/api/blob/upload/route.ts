import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { uuid } from '@/lib/api';

/**
 * Issues short-lived tokens so the browser can upload files straight to Vercel Blob
 * (this avoids the 4.5 MB request limit on Vercel functions).
 */
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        const pageId = uuid(clientPayload);
        if (!pathname.startsWith(`${user.id}/${pageId}/`)) throw new Error('Invalid upload path');
        const rows = await db()`select 1 from pages where id = ${pageId} and user_id = ${user.id}`;
        if (!rows.length) throw new Error('Page not found');
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024,
        };
      },
      // The attachment is recorded by POST /api/attachments once the upload finishes.
      onUploadCompleted: async () => {},
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
