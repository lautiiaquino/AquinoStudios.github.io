-- =====================================================================
-- Aquino Studios — Esquema de base de datos (Supabase / PostgreSQL)
-- Pegá TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------- PERFILES ----------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  roblox_username text check (roblox_username is null or roblox_username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar_url      text check (avatar_url is null or avatar_url ~ '^https://'),
  bio             text check (char_length(bio) <= 300),
  role            text not null default 'user' check (role in ('user', 'admin')),
  created_at      timestamptz not null default now()
);

-- ---------- JUEGOS ----------
create table if not exists public.games (
  id               bigint generated always as identity primary key,
  title            text not null check (char_length(title) between 1 and 80),
  slug             text unique not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  genre            text,
  status           text not null default 'publicado'
                   check (status in ('publicado', 'en_desarrollo', 'proximamente')),
  short_description text check (char_length(short_description) <= 200),
  description      text check (char_length(description) <= 5000),
  thumbnail_url    text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  roblox_place_id  bigint,
  featured         boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------- NOTICIAS ----------
create table if not exists public.news (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 120),
  body       text not null check (char_length(body) <= 5000),
  image_url  text check (image_url is null or image_url ~ '^https://'),
  game_id    bigint references public.games(id) on delete set null,
  published  boolean not null default true,
  author_id  uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- FAVORITOS ----------
create table if not exists public.favorites (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    bigint not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

-- ---------- COMENTARIOS ----------
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  game_id    bigint not null references public.games(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_game_idx on public.comments(game_id, created_at desc);

-- ---------- MENSAJES DE CONTACTO ----------
create table if not exists public.contact_messages (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(name) between 1 and 80),
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message    text not null check (char_length(message) between 1 and 2000),
  user_id    uuid references public.profiles(id) on delete set null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- COLUMNAS AGREGADAS EN LA VERSIÓN 2 ----------
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists banned_reason text check (char_length(banned_reason) <= 200);
alter table public.comments add column if not exists hidden boolean not null default false;
alter table public.games    add column if not exists release_at timestamptz;
alter table public.games    add column if not exists youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');

-- ---------- PALABRAS PROHIBIDAS (filtro de comentarios y reportes) ----------
create table if not exists public.banned_words (
  word       text primary key check (word ~ '^[a-z0-9áéíóúñü]{2,40}$'),
  created_at timestamptz not null default now()
);

-- ---------- EQUIPO ----------
create table if not exists public.team_members (
  id              bigint generated always as identity primary key,
  name            text not null check (char_length(name) between 1 and 60),
  role_title      text check (char_length(role_title) <= 60),
  bio             text check (char_length(bio) <= 300),
  avatar_url      text check (avatar_url is null or avatar_url ~ '^https://'),
  roblox_username text check (roblox_username is null or roblox_username ~ '^[A-Za-z0-9_]{3,20}$'),
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------- GALERÍA DE CADA JUEGO ----------
create table if not exists public.game_media (
  id         bigint generated always as identity primary key,
  game_id    bigint not null references public.games(id) on delete cascade,
  url        text not null check (url ~ '^https://'),
  caption    text check (char_length(caption) <= 120),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists game_media_game_idx on public.game_media(game_id, sort_order);

-- ---------- REGISTRO DE CAMBIOS DE CADA JUEGO ----------
create table if not exists public.game_updates (
  id         bigint generated always as identity primary key,
  game_id    bigint not null references public.games(id) on delete cascade,
  version    text check (char_length(version) <= 20),
  title      text not null check (char_length(title) between 1 and 120),
  body       text check (char_length(body) <= 3000),
  created_at timestamptz not null default now()
);
create index if not exists game_updates_game_idx on public.game_updates(game_id, created_at desc);

-- ---------- ENCUESTAS ----------
create table if not exists public.polls (
  id         bigint generated always as identity primary key,
  question   text not null check (char_length(question) between 1 and 200),
  game_id    bigint references public.games(id) on delete cascade,  -- null = encuesta general (inicio)
  active     boolean not null default true,
  closes_at  timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_options (
  id         bigint generated always as identity primary key,
  poll_id    bigint not null references public.polls(id) on delete cascade,
  label      text not null check (char_length(label) between 1 and 100),
  sort_order int not null default 0,
  unique (id, poll_id)
);
create table if not exists public.poll_votes (
  poll_id    bigint not null references public.polls(id) on delete cascade,
  option_id  bigint not null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (option_id, poll_id) references public.poll_options(id, poll_id) on delete cascade
);

-- ---------- SUGERENCIAS Y REPORTES DE BUGS ----------
create table if not exists public.suggestions (
  id         bigint generated always as identity primary key,
  game_id    bigint references public.games(id) on delete set null,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('sugerencia', 'bug')),
  title      text not null check (char_length(title) between 3 and 120),
  body       text not null check (char_length(body) between 1 and 2000),
  status     text not null default 'nueva'
             check (status in ('nueva', 'en_revision', 'planeada', 'resuelta', 'descartada')),
  created_at timestamptz not null default now()
);
create index if not exists suggestions_status_idx on public.suggestions(status, created_at desc);

-- =====================================================================
-- FUNCIONES
-- =====================================================================

-- ¿El usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Crea el perfil automáticamente cuando alguien se registra.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  -- Registro con email: viene "username". Con Google/Discord: se usa el nombre de esa cuenta.
  wanted text := left(regexp_replace(translate(coalesce(
    meta->>'username', meta->>'user_name', meta->>'preferred_username', meta->>'full_name', meta->>'name', ''
  ), 'áéíóúüñÁÉÍÓÚÜÑ ', 'aeiouunAEIOUUN_'), '[^A-Za-z0-9_]', '', 'g'), 20);
begin
  if wanted !~ '^[A-Za-z0-9_]{3,20}$' or exists (select 1 from public.profiles where lower(username) = lower(wanted)) then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  end if;
  insert into public.profiles (id, username) values (new.id, wanted);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Impide que un usuario normal se cambie el rol a sí mismo.
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() es null en el SQL Editor de Supabase: ahí sí se permite.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'No tenés permiso para cambiar roles';
  end if;
  if new.id = auth.uid() and old.role = 'admin' and new.role <> 'admin' then
    raise exception 'No podés quitarte el rol de admin a vos mismo';
  end if;
  if (new.banned is distinct from old.banned or new.banned_reason is distinct from old.banned_reason)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'No tenés permiso para banear usuarios';
  end if;
  if new.id = auth.uid() and new.banned and not old.banned then
    raise exception 'No podés banearte a vos mismo';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ¿Está libre este nombre de usuario? (se usa en el registro)
create or replace function public.username_available(name text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- Estadísticas públicas del sitio.
create or replace function public.site_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'members', (select count(*) from public.profiles),
    'games',   (select count(*) from public.games),
    'comments',(select count(*) from public.comments)
  );
$$;

-- ¿El usuario actual está baneado?
create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select banned from public.profiles where id = auth.uid()), false);
$$;

-- Rechaza comentarios y reportes con palabras prohibidas.
create or replace function public.check_banned_words()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  content text := lower(coalesce(to_jsonb(new)->>'title', '') || ' ' || coalesce(to_jsonb(new)->>'body', ''));
begin
  if exists (
    select 1 from public.banned_words
    where content ~ ('(^|[^a-z0-9áéíóúñü])' || word || '($|[^a-z0-9áéíóúñü])')
  ) then
    raise exception 'Tu mensaje tiene palabras no permitidas';
  end if;
  return new;
end;
$$;

drop trigger if exists comments_banned_words on public.comments;
create trigger comments_banned_words
  before insert or update of body on public.comments
  for each row execute function public.check_banned_words();

drop trigger if exists suggestions_banned_words on public.suggestions;
create trigger suggestions_banned_words
  before insert or update of title, body on public.suggestions
  for each row execute function public.check_banned_words();

-- Votos por opción (sin revelar quién votó).
create or replace function public.poll_counts(ids bigint[])
returns table (option_id bigint, votes bigint) language sql stable security definer set search_path = public as $$
  select o.id, count(v.user_id)
  from public.poll_options o left join public.poll_votes v on v.option_id = o.id
  where o.poll_id = any(ids)
  group by o.id;
$$;

-- Estadísticas para el panel de admin.
create or replace function public.admin_stats()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Solo para admins';
  end if;
  return json_build_object(
    'totals', json_build_object(
      'members',          (select count(*) from public.profiles),
      'new_7d',           (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'banned',           (select count(*) from public.profiles where banned),
      'comments',         (select count(*) from public.comments),
      'favorites',        (select count(*) from public.favorites),
      'votes',            (select count(*) from public.poll_votes),
      'suggestions_open', (select count(*) from public.suggestions where status in ('nueva', 'en_revision'))
    ),
    'signups', (
      select coalesce(json_agg(json_build_object('day', d::date,
        'count', (select count(*) from public.profiles p where p.created_at::date = d::date)) order by d), '[]'::json)
      from generate_series(current_date - 29, current_date, interval '1 day') d
    ),
    'top_favorites', (
      select coalesce(json_agg(t), '[]'::json) from (
        select g.title, count(f.user_id) as count
        from public.games g left join public.favorites f on f.game_id = g.id
        group by g.id order by count desc, g.title limit 8) t
    ),
    'top_comments', (
      select coalesce(json_agg(t), '[]'::json) from (
        select g.title, count(c.id) as count
        from public.games g left join public.comments c on c.game_id = g.id
        group by g.id order by count desc, g.title limit 8) t
    )
  );
end;
$$;

-- =====================================================================
-- SEGURIDAD (Row Level Security)
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.games            enable row level security;
alter table public.news             enable row level security;
alter table public.favorites        enable row level security;
alter table public.comments         enable row level security;
alter table public.contact_messages enable row level security;
alter table public.banned_words     enable row level security;
alter table public.team_members     enable row level security;
alter table public.game_media       enable row level security;
alter table public.game_updates     enable row level security;
alter table public.polls            enable row level security;
alter table public.poll_options     enable row level security;
alter table public.poll_votes       enable row level security;
alter table public.suggestions      enable row level security;

-- Perfiles: todos los ven, cada uno edita el suyo, el admin edita todos.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- Juegos: todos los ven, solo el admin los modifica.
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select using (true);
drop policy if exists "games_admin" on public.games;
create policy "games_admin" on public.games for all
  using (public.is_admin()) with check (public.is_admin());

-- Noticias: se ven las publicadas; el admin ve y modifica todo.
drop policy if exists "news_select" on public.news;
create policy "news_select" on public.news for select using (published or public.is_admin());
drop policy if exists "news_admin" on public.news;
create policy "news_admin" on public.news for all
  using (public.is_admin()) with check (public.is_admin());

-- Favoritos: cada usuario maneja los suyos.
drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Comentarios: todos leen los visibles; los ocultos solo el autor y el admin.
-- Comentan los usuarios logueados que no están baneados. Borran el autor o el admin.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select
  using (not hidden or auth.uid() = user_id or public.is_admin());
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert
  with check (auth.uid() = user_id and not hidden and not public.is_banned());
drop policy if exists "comments_update_admin" on public.comments;
create policy "comments_update_admin" on public.comments for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete
  using (auth.uid() = user_id or public.is_admin());

-- Contacto: cualquiera envía; solo el admin lee/gestiona.
drop policy if exists "contact_insert" on public.contact_messages;
create policy "contact_insert" on public.contact_messages for insert
  with check (user_id is null or user_id = auth.uid());
drop policy if exists "contact_admin" on public.contact_messages;
create policy "contact_admin" on public.contact_messages for all
  using (public.is_admin()) with check (public.is_admin());

-- Palabras prohibidas: solo el admin.
drop policy if exists "banned_words_admin" on public.banned_words;
create policy "banned_words_admin" on public.banned_words for all
  using (public.is_admin()) with check (public.is_admin());

-- Equipo, galería, cambios y encuestas: todos los ven, solo el admin los modifica.
drop policy if exists "team_select" on public.team_members;
create policy "team_select" on public.team_members for select using (true);
drop policy if exists "team_admin" on public.team_members;
create policy "team_admin" on public.team_members for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "media_select" on public.game_media;
create policy "media_select" on public.game_media for select using (true);
drop policy if exists "media_admin" on public.game_media;
create policy "media_admin" on public.game_media for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "updates_select" on public.game_updates;
create policy "updates_select" on public.game_updates for select using (true);
drop policy if exists "updates_admin" on public.game_updates;
create policy "updates_admin" on public.game_updates for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "polls_select" on public.polls;
create policy "polls_select" on public.polls for select using (true);
drop policy if exists "polls_admin" on public.polls;
create policy "polls_admin" on public.polls for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "poll_options_select" on public.poll_options;
create policy "poll_options_select" on public.poll_options for select using (true);
drop policy if exists "poll_options_admin" on public.poll_options;
create policy "poll_options_admin" on public.poll_options for all using (public.is_admin()) with check (public.is_admin());

-- Votos: cada uno ve y cambia el suyo, solo si la encuesta está abierta y no está baneado.
drop policy if exists "votes_select" on public.poll_votes;
create policy "votes_select" on public.poll_votes for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "votes_insert" on public.poll_votes;
create policy "votes_insert" on public.poll_votes for insert with check (
  auth.uid() = user_id and not public.is_banned() and exists (
    select 1 from public.polls p where p.id = poll_id and p.active and (p.closes_at is null or p.closes_at > now())));
drop policy if exists "votes_update" on public.poll_votes;
create policy "votes_update" on public.poll_votes for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id and not public.is_banned() and exists (
    select 1 from public.polls p where p.id = poll_id and p.active and (p.closes_at is null or p.closes_at > now())));
drop policy if exists "votes_delete" on public.poll_votes;
create policy "votes_delete" on public.poll_votes for delete using (auth.uid() = user_id);

-- Sugerencias y bugs: cada uno ve los suyos; el admin ve y gestiona todos.
drop policy if exists "suggestions_select" on public.suggestions;
create policy "suggestions_select" on public.suggestions for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "suggestions_insert" on public.suggestions;
create policy "suggestions_insert" on public.suggestions for insert
  with check (auth.uid() = user_id and status = 'nueva' and not public.is_banned());
drop policy if exists "suggestions_admin" on public.suggestions;
create policy "suggestions_admin" on public.suggestions for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "suggestions_delete" on public.suggestions;
create policy "suggestions_delete" on public.suggestions for delete using (public.is_admin());

-- =====================================================================
-- IMÁGENES (Supabase Storage): carpeta pública "media".
-- Todos pueden ver las imágenes; solo el admin puede subir o borrar.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_admin_insert" on storage.objects;
create policy "media_admin_insert" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update" on storage.objects for update
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete" on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());

-- =====================================================================
-- TIEMPO REAL: los comentarios nuevos aparecen sin recargar la página.
-- (Respeta las mismas reglas de seguridad: cada uno solo recibe lo que puede ver.)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- =====================================================================
-- DATOS DE EJEMPLO (podés borrarlos desde el panel de admin)
-- =====================================================================
insert into public.games (title, slug, genre, status, short_description, description, featured, sort_order)
values
  ('Mi Primer Juego', 'mi-primer-juego', 'Aventura', 'publicado',
   'Editá este juego desde el panel de administración.',
   'Esta es una descripción de ejemplo. Entrá a /admin.html para cambiar el título, la imagen, el ID del lugar de Roblox y todo lo demás.',
   true, 1),
  ('Próximo Proyecto', 'proximo-proyecto', 'Simulador', 'en_desarrollo',
   'Un juego que todavía está en desarrollo.',
   'Descripción de ejemplo para un juego en desarrollo.',
   false, 2)
on conflict (slug) do nothing;

insert into public.news (title, body)
select '¡Bienvenidos a Aquino Studios!', 'Este es el sitio oficial de Aquino Studios. Acá vas a encontrar todos nuestros juegos de Roblox, novedades y actualizaciones.'
where not exists (select 1 from public.news);

-- =====================================================================
-- HACERTE ADMIN: registrate en el sitio y después ejecutá esto
-- (cambiando TU_USUARIO por tu nombre de usuario del sitio):
--
--   update public.profiles set role = 'admin' where username = 'TU_USUARIO';
-- =====================================================================
