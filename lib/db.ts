import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let client: NeonQueryFunction<false, false> | null = null;

/** Finds the Postgres connection string, including prefixed names like STORAGE_DATABASE_URL. */
export function databaseUrl() {
  const env = process.env;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const key = Object.keys(env).find((k) => /_(DATABASE_URL|POSTGRES_URL)$/.test(k) && env[k]);
  return key ? env[key] : undefined;
}

/** Lazily-created SQL tagged template: await db()`select ...` */
export function db() {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}
