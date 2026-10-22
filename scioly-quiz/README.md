# Practice Lab

Practice quizzes for any subject. Students get instant feedback on every question. Coaches create classes, share a join code, and track each student's progress by part, section and rules topic.

The first question set, **Science Olympiad A&P Division B (Respiratory, Digestive, Immune), 985 questions**, is included in `content/`.

- **App:** Next.js 15 (App Router, TypeScript), hosted on Vercel
- **Database and sign-in:** Supabase (Postgres, Auth, row-level security)
- **Grading happens on the server.** Answer keys live in a table no browser can read, and the `submit_answer` database function grades each answer.

---

## 1. Set up Supabase (about 10 minutes)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole of `supabase/migrations/20261022000000_init.sql` and run it.
   (Or with the Supabase CLI: `supabase link` then `supabase db push`.)
3. Go to **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` for now (change it to your Vercel URL after deploying)
   - **Redirect URLs:** add `http://localhost:3000/auth/callback` and, later, `https://YOUR-APP.vercel.app/auth/callback`
4. Email sign-in links work out of the box. To add **Continue with Google**, enable Google under **Authentication → Sign In / Providers** and follow Supabase's steps for creating a Google OAuth client.
5. Go to **Project Settings → API Keys** and copy the project URL, the **publishable** key and the **secret** key.

> Supabase's built-in email sender is limited to a few messages an hour and is meant for testing. Before a whole class signs in, set up custom SMTP under **Authentication → Emails → SMTP Settings** (for example Resend, Postmark or your domain's email provider).

## 2. Run it on your computer

Needs Node.js 20 or newer, and Python 3 if you edit question banks.

```bash
cp .env.example .env.local      # then paste your Supabase URL and keys into .env.local
npm install
npm run content:import          # loads the 985 A&P questions into your database
npm run dev                     # open http://localhost:3000
```

Sign in, open **Classes → Create a class**, assign the A&P set and share the join code with students.

## 3. Put it on GitHub

Create a **private** repository. The question JSON in `content/` contains the answer keys.

```bash
git init
git add .
git commit -m "Practice Lab: first version"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
git push -u origin main
```

`.env.local` is in `.gitignore`, so your keys stay on your computer.

## 4. Deploy on Vercel

1. In Vercel, **Add New → Project**, and import the GitHub repository.
2. Add environment variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Do **not** add `SUPABASE_SECRET_KEY` to Vercel. Only the import script on your computer uses it.
3. Deploy. Then in Supabase, set **Site URL** to your Vercel URL and add `https://YOUR-APP.vercel.app/auth/callback` to **Redirect URLs**.

Every push to `main` deploys automatically, and pull requests get preview links.

---

## How it works

| Who | What they do |
| --- | --- |
| Student | Signs in, joins a class with the code, practices any question set. Each answer is graded on the server right away and shows the correct answer and explanation. Free-response questions show a model answer, and the student marks themselves. |
| Coach | Creates classes, assigns question sets, and sees each student's answered count and accuracy (overall, by part, by section, by rules topic), the class's most-missed questions, and each student's missed list. |

A student's score uses their **latest try** on each question, so retrying a missed question updates their accuracy.

### Database (all in `supabase/migrations/`)

| Table | Holds | Who can read it |
| --- | --- | --- |
| `subjects`, `question_sets`, `questions` | Content, without answers | Anyone signed in (published sets only) |
| `question_keys` | Answer keys and explanations | Nobody through the app; read only inside `submit_answer` |
| `classes`, `class_members`, `class_sets` | Classes, rosters, assigned sets | Class members; the roster only to coaches |
| `attempts` | Every answer submitted | The student, and coaches of classes that student is in |
| `profiles` | Display name | The person, and their coaches |

Database functions the app calls: `submit_answer`, `self_mark`, `join_class`, `class_progress`, `class_hardest`.

## Adding a subject or question set

1. Write the questions in the plain-text format (see the top of `scripts/bank_to_json.py` and the examples in `content/sources/ap-divb/`). Use one file per part:

   ```text
   # R | Part 1 – Respiratory System
   ## A. Multiple Choice
   ? [1] Gas exchange in the lungs occurs mainly in the:
   - trachea
   - bronchi
   - alveoli
   = c — alveoli have one-cell-thick walls next to capillaries.
   ```

2. Copy `content/sets/example-config.json`, change the subject, set and rules topics, and convert:

   ```bash
   python3 scripts/bank_to_json.py content/sources/my-subject content/my-subject.json --config content/sets/my-subject.json
   node --env-file=.env.local scripts/import-questions.mjs content/my-subject.json
   ```

   Re-running the import updates questions in place (matched by code such as `R12`), so student history is kept. Add `--prune` to delete questions you removed from the file, or `--unpublished` to load a set hidden from students.

## Student privacy

Many middle-school students are under 13, which brings in COPPA (the US Children's Online Privacy Protection Act). Collecting a child's email or sign-in usually needs parental consent, or school authorization when a school runs the program. This app stores only a display name, the sign-in email (held by Supabase Auth) and answers. Agree on a consent approach with your school or parents before inviting students, for example parents signing in for their child. This is not legal advice.

## Project layout

```
src/app/                    pages (home, login, sets/[setId] quiz, classes, classes/[classId] dashboard, account)
src/lib/supabase/           Supabase clients for browser, server and middleware
supabase/migrations/        database schema, access rules and grading functions
scripts/bank_to_json.py     text question bank → JSON (with rules-topic tags)
scripts/import-questions.mjs  JSON → Supabase
content/                    question sources and generated JSON
```

## Useful commands

| Command | Does |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build (what Vercel runs) |
| `npm run typecheck` | TypeScript check |
| `npm run content:build` | Rebuild `content/ap-divb-2026.json` from the text sources |
| `npm run content:import` | Load `content/ap-divb-2026.json` into Supabase |
