// Creates the database tables. Runs automatically before `next build`.
import { neon } from '@neondatabase/serverless';

for (const file of ['.env.local', '.env']) {
  try { process.loadEnvFile(file); } catch {}
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.warn('[migrate] DATABASE_URL is not set - skipping database setup.');
  process.exit(0);
}

const sql = neon(url);

const statements = [
  `create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists notebooks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists sections (
    id uuid primary key default gen_random_uuid(),
    notebook_id uuid not null references notebooks(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists pages (
    id uuid primary key default gen_random_uuid(),
    section_id uuid not null references sections(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    title text not null default 'Untitled page',
    content text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists attachments (
    id uuid primary key default gen_random_uuid(),
    page_id uuid not null references pages(id) on delete cascade,
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    size bigint not null default 0,
    content_type text not null default 'application/octet-stream',
    blob_url text not null,
    pathname text not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists notebooks_user_idx on notebooks(user_id)`,
  `create index if not exists sections_notebook_idx on sections(notebook_id)`,
  `create index if not exists pages_section_idx on pages(section_id)`,
  `create index if not exists attachments_page_idx on attachments(page_id)`,
];

for (const statement of statements) {
  await sql.query(statement);
}
console.log('[migrate] Database is ready.');
