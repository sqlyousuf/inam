# Notes

A OneNote-style notebook app with login, built with Next.js and hosted on Vercel.

- **Notebooks → Sections → Pages**, with a rich-text editor that saves automatically
- **Sign in** with email and password
- **Upload** files to any page by clicking the button or dragging them in (up to 100 MB by default)
- **Download** files, or download a whole page as an HTML file
- **Delete** files, pages, sections and notebooks. Deleting also removes the stored files.
- Works on phones, and follows your system's light or dark mode

Notes are stored in Postgres (Neon) and files in Vercel Blob. Files are private and can only be downloaded while you're signed in.

## Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Notes app"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Import the project in Vercel.** Go to [vercel.com/new](https://vercel.com/new) and pick your repo. Keep the default settings. The first deploy may fail because nothing is connected yet. That's fine.

3. **Add a database.** In your Vercel project, open **Storage** → **Create Database** → **Neon (Postgres)** and connect it to the project. This adds `DATABASE_URL`.

4. **Add file storage.** Open **Storage** → **Create** → **Blob**, choose **Private** access, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.

5. **Add a login secret.** Open **Settings** → **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `AUTH_SECRET` | a long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

6. **Redeploy** from the **Deployments** tab (⋯ → Redeploy). The build creates the database tables automatically.

7. Open the site and **create your account**. After the first account exists, sign-up closes automatically, so only you can use the app.

## Optional settings

| Variable | Default | Meaning |
|---|---|---|
| `ALLOW_SIGNUP` | `false` | Set to `true` to let anyone create an account (each person only sees their own notes) |
| `MAX_UPLOAD_MB` | `100` | Largest file you can upload |
| `BLOB_ACCESS` | `private` | Set to `public` only if you created a **public** Blob store |

## Run locally

```bash
npm install
npx vercel link          # connect to your Vercel project
npx vercel env pull .env.local
npm run db:migrate
npm run dev
```

Then open http://localhost:3000.

## Project layout

```
app/
  page.tsx               main app (redirects to /login when signed out)
  login/page.tsx         sign in / sign up
  api/auth/*             login, signup, logout
  api/notebooks, sections, pages   create / rename / delete
  api/pages/[id]/export  download a page as HTML
  api/blob/upload        issues upload tokens (the browser uploads directly to Blob)
  api/attachments        record, download and delete files
components/
  NotesApp.tsx           three-pane notebook UI
  Editor.tsx             rich-text editor (TipTap)
lib/                     database, session and API helpers
scripts/migrate.mjs      creates the database tables
```
