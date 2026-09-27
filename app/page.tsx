import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { blobAccess } from '@/lib/api';
import NotesApp from '@/components/NotesApp';

export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/login');
  return <NotesApp user={user} blobAccess={blobAccess()} />;
}
