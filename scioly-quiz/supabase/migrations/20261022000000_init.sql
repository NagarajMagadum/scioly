-- Practice quiz platform: schema, access rules and grading functions.
-- Answer keys live in question_keys, which no client role can read.
-- All grading happens inside submit_answer() on the server.


-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1)), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.question_sets (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null default '',
  parts jsonb not null default '[]',     -- [{code, title}]
  sections jsonb not null default '[]',  -- [{code, title}]
  topics jsonb not null default '[]',    -- [{code, part, title}] rules topics used as tags
  published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (subject_id, slug)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.question_sets (id) on delete cascade,
  code text not null,                    -- e.g. R12
  position int not null,
  part text not null,
  section text not null,
  qtype text not null check (qtype in ('mc', 'multi', 'tf', 'match', 'free')),
  points numeric(6, 2) not null default 1,
  tiebreaker boolean not null default false,
  pre text,
  stem text not null,
  after_text jsonb not null default '[]',
  table_data jsonb,                      -- rows of cells, first row is the header
  options jsonb,                         -- mc / multi: ["...", "..."]
  match_left jsonb,                      -- match: ["1. ...", ...]
  match_choices jsonb,                   -- match: [[value, label], ...]
  tags text[] not null default '{}',
  unique (set_id, code)
);
create index questions_set_position on public.questions (set_id, position);

-- Server-only: never exposed to anon or authenticated roles.
create table public.question_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  key jsonb not null default '[]',       -- mc/tf: ["b"]; multi: ["a","c"]; match: ["b","d",...]
  answer_text text not null default '',
  explanation text not null default ''
);

-- ---------------------------------------------------------------------------
-- Classes
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  join_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index class_members_user on public.class_members (user_id);

create table public.class_sets (
  class_id uuid not null references public.classes (id) on delete cascade,
  set_id uuid not null references public.question_sets (id) on delete cascade,
  primary key (class_id, set_id)
);

create function public.add_owner_as_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.class_members (class_id, user_id, role)
  values (new.id, new.owner_id, 'teacher')
  on conflict (class_id, user_id) do update set role = 'teacher';
  return new;
end;
$$;

create trigger on_class_created
  after insert on public.classes
  for each row execute function public.add_owner_as_teacher();

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  response jsonb not null,
  correct boolean,                       -- null = free response waiting for self-mark
  created_at timestamptz not null default now()
);
create index attempts_user_question on public.attempts (user_id, question_id, created_at desc);
create index attempts_question on public.attempts (question_id);

-- Latest attempt per student per question. security_invoker keeps RLS in force.
create view public.latest_attempts
with (security_invoker = true)
as
select distinct on (a.user_id, a.question_id)
  a.id, a.user_id, a.question_id, q.set_id, a.correct, a.response, a.created_at
from public.attempts a
join public.questions q on q.id = a.question_id
order by a.user_id, a.question_id, a.created_at desc;

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------
create function public.is_class_member(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members
    where class_id = p_class and user_id = auth.uid()
  );
$$;

create function public.is_class_teacher(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members
    where class_id = p_class and user_id = auth.uid() and role = 'teacher'
  );
$$;

create function public.teaches_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.class_members t
    join public.class_members s on s.class_id = t.class_id
    where t.user_id = auth.uid() and t.role = 'teacher' and s.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.question_sets enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_sets enable row level security;
alter table public.attempts enable row level security;

create policy "read own or my students' profiles" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.teaches_student(id));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "signed-in users read subjects" on public.subjects
  for select to authenticated using (true);
create policy "signed-in users read published sets" on public.question_sets
  for select to authenticated using (published);
create policy "signed-in users read questions of published sets" on public.questions
  for select to authenticated
  using (exists (select 1 from public.question_sets s where s.id = set_id and s.published));
-- question_keys: RLS on, no policies, privileges revoked below. Nobody but the server reads keys.

create policy "members read their classes" on public.classes
  for select to authenticated using (owner_id = auth.uid() or public.is_class_member(id));
create policy "anyone signed in creates a class they own" on public.classes
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owner renames class" on public.classes
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes class" on public.classes
  for delete to authenticated using (owner_id = auth.uid());

create policy "see own memberships and, as teacher, the roster" on public.class_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_class_teacher(class_id));
create policy "teacher removes a member or a student leaves" on public.class_members
  for delete to authenticated
  using (public.is_class_teacher(class_id) or (user_id = auth.uid() and role = 'student'));

create policy "members see assigned sets" on public.class_sets
  for select to authenticated using (public.is_class_member(class_id));
create policy "teacher assigns sets" on public.class_sets
  for insert to authenticated with check (public.is_class_teacher(class_id));
create policy "teacher unassigns sets" on public.class_sets
  for delete to authenticated using (public.is_class_teacher(class_id));

create policy "read own attempts, or my students' attempts" on public.attempts
  for select to authenticated
  using (user_id = auth.uid() or public.teaches_student(user_id));
-- No insert/update policies: attempts are written only by submit_answer() and self_mark().

revoke all on public.question_keys from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.attempts from authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Grade one answer on the server, record it, and return the key and explanation.
-- Response shapes: mc/tf {"value":"b"}, multi {"values":["a","c"]},
-- match {"values":["b","d",...]}, free {"text":"..."}.
create function public.submit_answer(p_question uuid, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.questions;
  v_k public.question_keys;
  v_correct boolean;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to submit answers' using errcode = '42501';
  end if;
  if p_response is null or length(p_response::text) > 8000 then
    raise exception 'Answer is missing or too long' using errcode = '22023';
  end if;

  select q.* into v_q
  from public.questions q
  join public.question_sets s on s.id = q.set_id and s.published
  where q.id = p_question;
  if not found then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;

  select * into v_k from public.question_keys where question_id = p_question;

  if v_q.qtype in ('mc', 'tf') then
    v_correct := coalesce(p_response ->> 'value', '') = coalesce(v_k.key ->> 0, '#none');
  elsif v_q.qtype = 'multi' then
    v_correct := coalesce((select array_agg(x order by x) from jsonb_array_elements_text(p_response -> 'values') x), '{}')
               = coalesce((select array_agg(x order by x) from jsonb_array_elements_text(v_k.key) x), '{none}');
  elsif v_q.qtype = 'match' then
    v_correct := coalesce(p_response -> 'values', '[]'::jsonb) = v_k.key;
  else
    v_correct := null; -- free response: the student marks it after seeing the model answer
  end if;

  insert into public.attempts (user_id, question_id, response, correct)
  values (v_uid, p_question, p_response, v_correct)
  returning id into v_id;

  return jsonb_build_object(
    'attempt_id', v_id,
    'correct', v_correct,
    'key', coalesce(v_k.key, '[]'::jsonb),
    'answer', coalesce(v_k.answer_text, ''),
    'explanation', coalesce(v_k.explanation, '')
  );
end;
$$;

-- A student marks their own free-response attempt after reading the model answer.
create function public.self_mark(p_attempt uuid, p_correct boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.attempts a
  set correct = p_correct
  from public.questions q
  where a.id = p_attempt
    and a.user_id = auth.uid()
    and q.id = a.question_id
    and q.qtype = 'free'
    and a.correct is null;
  if not found then
    raise exception 'Attempt not found or already marked' using errcode = 'P0002';
  end if;
end;
$$;

-- Join a class with its code. Returns the class id.
create function public.join_class(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a class' using errcode = '42501';
  end if;
  select id into v_class from public.classes where join_code = upper(trim(p_code));
  if v_class is null then
    raise exception 'No class has that code' using errcode = 'P0002';
  end if;
  insert into public.class_members (class_id, user_id, role)
  values (v_class, auth.uid(), 'student')
  on conflict (class_id, user_id) do nothing;
  return v_class;
end;
$$;

-- Teacher view: one row per student with totals, by part, by section and by topic.
create function public.class_progress(p_class uuid, p_set uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  answered int,
  graded int,
  correct int,
  waiting int,
  by_part jsonb,
  by_section jsonb,
  by_topic jsonb,
  last_active timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Only the class teacher can see class progress' using errcode = '42501';
  end if;

  return query
  with students as (
    select m.user_id from public.class_members m
    where m.class_id = p_class and m.role = 'student'
  ),
  la as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.correct, a.created_at, q.part, q.part || q.section as psec, q.tags
    from public.attempts a
    join public.questions q on q.id = a.question_id and q.set_id = p_set
    where a.user_id in (select s.user_id from students s)
    order by a.user_id, a.question_id, a.created_at desc
  ),
  tot as (
    select la.user_id,
      count(*)::int as answered,
      count(la.correct)::int as graded,
      count(*) filter (where la.correct)::int as correct,
      count(*) filter (where la.correct is null)::int as waiting,
      max(la.created_at) as last_active
    from la group by la.user_id
  ),
  bp as (
    select x.user_id, jsonb_object_agg(x.part, jsonb_build_object('n', x.n, 'g', x.g, 'c', x.c)) as j
    from (select la.user_id, la.part, count(*)::int n, count(la.correct)::int g, count(*) filter (where la.correct)::int c
          from la group by la.user_id, la.part) x
    group by x.user_id
  ),
  bs as (
    select x.user_id, jsonb_object_agg(x.psec, jsonb_build_object('g', x.g, 'c', x.c)) as j
    from (select la.user_id, la.psec, count(la.correct)::int g, count(*) filter (where la.correct)::int c
          from la group by la.user_id, la.psec) x
    group by x.user_id
  ),
  bt as (
    select x.user_id, jsonb_object_agg(x.tag, jsonb_build_object('g', x.g, 'c', x.c)) as j
    from (select la.user_id, t.tag, count(la.correct)::int g, count(*) filter (where la.correct)::int c
          from la cross join lateral unnest(la.tags) as t(tag)
          group by la.user_id, t.tag) x
    group by x.user_id
  )
  select s.user_id,
    coalesce(p.display_name, ''),
    u.email::text,
    coalesce(tot.answered, 0), coalesce(tot.graded, 0), coalesce(tot.correct, 0), coalesce(tot.waiting, 0),
    coalesce(bp.j, '{}'::jsonb), coalesce(bs.j, '{}'::jsonb), coalesce(bt.j, '{}'::jsonb),
    tot.last_active
  from students s
  left join public.profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  left join tot on tot.user_id = s.user_id
  left join bp on bp.user_id = s.user_id
  left join bs on bs.user_id = s.user_id
  left join bt on bt.user_id = s.user_id
  order by tot.last_active desc nulls last, p.display_name;
end;
$$;

-- Teacher view: questions the class misses most (latest attempt per student, at least 2 graded).
create function public.class_hardest(p_class uuid, p_set uuid, p_limit int default 15)
returns table (question_id uuid, code text, stem text, graded int, missed int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_class_teacher(p_class) then
    raise exception 'Only the class teacher can see class progress' using errcode = '42501';
  end if;
  return query
  with la as (
    select distinct on (a.user_id, a.question_id) a.question_id, a.correct
    from public.attempts a
    join public.questions q on q.id = a.question_id and q.set_id = p_set
    where a.user_id in (select m.user_id from public.class_members m where m.class_id = p_class and m.role = 'student')
    order by a.user_id, a.question_id, a.created_at desc
  )
  select q.id, q.code, q.stem, count(la.correct)::int, count(*) filter (where la.correct = false)::int
  from la join public.questions q on q.id = la.question_id
  group by q.id, q.code, q.stem, q.position
  having count(la.correct) >= 2 and count(*) filter (where la.correct = false) > 0
  order by (count(*) filter (where la.correct = false))::numeric / count(la.correct) desc, count(la.correct) desc, q.position
  limit greatest(1, least(p_limit, 100));
end;
$$;

revoke all on function public.submit_answer(uuid, jsonb) from public, anon;
revoke all on function public.self_mark(uuid, boolean) from public, anon;
revoke all on function public.join_class(text) from public, anon;
revoke all on function public.class_progress(uuid, uuid) from public, anon;
revoke all on function public.class_hardest(uuid, uuid, int) from public, anon;
revoke all on function public.is_class_member(uuid) from public, anon;
revoke all on function public.is_class_teacher(uuid) from public, anon;
revoke all on function public.teaches_student(uuid) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_owner_as_teacher() from public, anon, authenticated;

grant execute on function public.submit_answer(uuid, jsonb) to authenticated;
grant execute on function public.self_mark(uuid, boolean) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.class_progress(uuid, uuid) to authenticated;
grant execute on function public.class_hardest(uuid, uuid, int) to authenticated;
grant execute on function public.is_class_member(uuid) to authenticated;
grant execute on function public.is_class_teacher(uuid) to authenticated;
grant execute on function public.teaches_student(uuid) to authenticated;
grant select on public.latest_attempts to authenticated;
