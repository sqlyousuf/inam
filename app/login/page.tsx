import { redirect } from 'next/navigation';
import { getUser, signupAllowed } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export default async function LoginPage() {
  if (await getUser()) redirect('/');

  let allowSignup = false;
  let setupError = '';
  try {
    allowSignup = await signupAllowed();
  } catch (error) {
    console.error(error);
    setupError = 'The database is not reachable. Check DATABASE_URL and run the migration.';
  }

  return <AuthForm allowSignup={allowSignup} setupError={setupError} />;
}
