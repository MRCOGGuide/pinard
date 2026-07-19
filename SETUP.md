# Pinard — first-time setup (beginner walkthrough)

Follow these steps once, in order. Afterwards you just run `npm run dev`.

---

## 1. Create the Supabase project

1. Go to **https://supabase.com** and click **Start your project**. Sign up
   (GitHub or email — either is fine).
2. Click **New project**.
   - **Name:** `pinard`
   - **Database password:** click **Generate a password** and save it
     somewhere safe (a password manager). You rarely need it, but keep it.
   - **Region:** choose **West EU (London)** — closest to your users.
3. Click **Create new project** and wait a minute or two while it provisions.

## 2. Get your keys and paste them into `.env.local`

1. In the Supabase dashboard, open **Project settings** (gear icon, bottom
   left) → **API keys** (under "Configuration"). If your dashboard shows a
   **Data API** page instead, the same values live there.
2. You need three values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — a long string starting `eyJ…` (or `sb_publishable_…` on newer projects)
   - **service_role / secret key** — another long string. **This one is
     secret**: it bypasses all security rules. Never share it, never put it
     anywhere except `.env.local`.
3. Open the file `pinard/.env.local` in any text editor and replace the
   placeholders:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your anon key...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...your service role key...
   ```

   No quotes, no spaces around the `=`. Save the file. `.env.local` is
   git-ignored, so the keys never end up in your repository.

## 3. Create the database (tables, pgvector, security rules)

1. In the Supabase dashboard, open the **SQL Editor** (left sidebar).
2. Open the file `pinard/supabase/schema.sql` on your computer, select
   **everything** (Ctrl+A), copy it.
3. Paste it into the SQL editor and click **Run** (or Ctrl+Enter).
4. You should see **"Success. No rows returned"**. That one run:
   - enabled the **pgvector** extension (for AI embeddings later),
   - created all 13 tables from PROJECT.md section 6,
   - turned on row-level security everywhere with the right policies,
   - set up the trigger that creates a `profiles` row for every new user.
5. Check it worked: open **Table Editor** in the sidebar — you should see
   `profiles`, `sections`, `content_documents`, and the rest.

> If the editor complains that something "already exists", the script was
> already run — that's fine, nothing to fix.

## 4. Configure email/password auth

1. In the dashboard go to **Authentication → Sign In / Providers**.
2. **Email** is enabled by default — that's our email/password sign-in.
3. While you're developing, turn **off** "Confirm email" (same page) so you
   can sign in immediately after signing up without clicking email links.
   Turn it back **on** before real users arrive.

## 5. Run the app

Open a terminal (PowerShell) and run:

```powershell
cd "C:\Users\Emmanuel\OneDrive\MRCOG Guide\Claude Road Map\pinard"
npm run dev
```

Then open **http://localhost:3000** in your browser. Stop the server with
Ctrl+C. (If `npm` isn't recognised, close and reopen the terminal — Node was
added to your PATH and new terminals pick it up.)

## 6. Create your account and make it admin

1. On the site, click **Sign in → Create an account** and register with your
   own email and a password.
2. Back in the Supabase dashboard, open the **SQL Editor** and run:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

   (Replace `you@example.com` with the email you registered.)
3. Refresh http://localhost:3000 — an **Admin** link now appears in the
   navigation, and `/admin` opens for you. Everyone else who signs up is a
   normal `user` and gets redirected away from `/admin`.

---

### Where things live

| What | Where |
|---|---|
| Colour tokens & fonts | `tailwind.config.ts`, `src/app/layout.tsx` |
| The trace underline | `src/components/Trace.tsx` + `.trace-path` in `src/app/globals.css` |
| Logo | `src/components/Logo.tsx` (inline) and `public/pinard-logo.svg` |
| Header / footer / shell | `src/components/SiteHeader.tsx`, `SiteFooter.tsx`, `src/app/layout.tsx` |
| Auth screens | `src/app/sign-in/`, `src/app/sign-up/`, `src/app/auth/sign-out/` |
| Supabase clients | `src/lib/supabase/` (+ `src/middleware.ts` session refresh) |
| Database schema | `supabase/schema.sql` |
| Secrets | `.env.local` (never committed) |

### A note on OneDrive

This project lives inside OneDrive, which will try to sync the huge
`node_modules` folder and can occasionally lock files during `npm install`.
If installs ever behave strangely: right-click the `pinard/node_modules`
folder → **Free up space**, or move the whole project outside OneDrive
(e.g. `C:\dev\pinard`) and keep OneDrive for documents.
