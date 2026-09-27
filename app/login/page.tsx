import { redirect } from 'next/navigation';
import { getUser, signupAllowed } from '@/lib/auth';
import { databaseUrl } from '@/lib/db';
import AuthForm from '@/components/AuthForm';

export default async function LoginPage() {
  if (await getUser()) redirect('/');

  let allowSignup = false;
  let setupError = '';
  try {
    allowSignup = await signupAllowed();
  } catch (error) {
    console.error(error);
    const code = (error as { code?: string }).code;
    if (!databaseUrl()) {
      setupError =
        'No database is connected. In Vercel, connect a Neon database under Storage, then redeploy.';
    } else if (code === '42P01') {
      setupError = 'The database tables have not been created yet. Redeploy the project to create them.';
    } else {
      setupError = `Could not connect to the database: ${(error as Error).message}`;
    }
  }

  return <AuthForm allowSignup={allowSignup} setupError={setupError} />;
}
