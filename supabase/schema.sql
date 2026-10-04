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

-- ---------- VISITAS (para las estadísticas del panel) ----------
create table if not exists public.visits (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  path       text not null check (char_length(path) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists visits_created_idx on public.visits(created_at desc);
create index if not exists visits_user_idx on public.visits(user_id, created_at desc);

-- ---------- DONACIONES (Mercado Pago) ----------
-- Las filas las crea y actualiza solo la Edge Function "donate" (con la service role),
-- así nadie puede marcar una donación como pagada desde el navegador.
create table if not exists public.donations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete set null,
  amount        numeric(12, 2) not null,
  currency      text not null default 'ARS',
  message       text check (char_length(message) <= 200),
  status        text not null default 'pendiente',
  mp_payment_id text,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create index if not exists donations_created_idx on public.donations(created_at desc);
-- Versión 2 de donaciones: varios métodos de pago y muro de donadores
alter table public.donations add column if not exists provider     text not null default 'mercadopago';
alter table public.donations add column if not exists provider_ref text;
alter table public.donations add column if not exists show_name    boolean not null default true;
create index if not exists donations_ref_idx on public.donations(provider, provider_ref);
alter table public.donations drop constraint if exists donations_amount_check;
alter table public.donations add  constraint donations_amount_check check (amount > 0 and amount <= 1000000);
alter table public.donations drop constraint if exists donations_status_check;
alter table public.donations add  constraint donations_status_check
  check (status in ('pendiente', 'por_confirmar', 'aprobada', 'rechazada', 'cancelada', 'reembolsada'));
alter table public.donations drop constraint if exists donations_currency_check;
alter table public.donations add  constraint donations_currency_check check (currency in ('ARS', 'USD', 'ROBUX', 'USDT', 'BTC', 'ETH'));
alter table public.donations drop constraint if exists donations_provider_check;
alter table public.donations add  constraint donations_provider_check
  check (provider in ('mercadopago', 'paypal', 'stripe', 'payoneer', 'transferencia', 'cripto', 'robux', 'otro'));

-- ---------- AJUSTES DEL SITIO (meta de donaciones, etc.) ----------
create table if not exists public.settings (
  key        text primary key check (char_length(key) <= 60),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value)
values ('donation_goal', '{"amount": 50000, "label": "Servidores, anuncios y nuevos juegos", "usd_rate": 1200, "robux_rate": 10}')
on conflict (key) do nothing;

-- ---------- CÓDIGOS DE LOS JUEGOS (los que se canjean adentro del juego) ----------
create table if not exists public.game_codes (
  id         bigint generated always as identity primary key,
  game_id    bigint not null references public.games(id) on delete cascade,
  code       text not null check (char_length(code) between 1 and 40),
  reward     text check (char_length(reward) <= 120),
  expires_at timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists game_codes_game_idx on public.game_codes(game_id, created_at desc);

-- Insignia de donador en el perfil (la pone sola la base cuando se aprueba una donación)
alter table public.profiles add column if not exists supporter boolean not null default false;
-- Perfil público: cada uno decide si muestra sus juegos favoritos
alter table public.profiles add column if not exists show_favorites boolean not null default false;

-- ---------- COLUMNAS AGREGADAS EN LA VERSIÓN 2 ----------
alter table public.profiles add column if not exists banned boolean not null default false;
alter table public.profiles add column if not exists banned_reason text check (char_length(banned_reason) <= 200);
alter table public.comments add column if not exists hidden boolean not null default false;
alter table public.games    add column if not exists release_at timestamptz;
alter table public.games    add column if not exists youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$');
alter table public.games    add column if not exists trailer_url text check (trailer_url is null or trailer_url ~ '^(videos/[A-Za-z0-9_-]+|https://[^[:space:]]+)\.(mp4|webm)$');

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

-- ---------- ÍNDICES PARA ESCALAR ----------
-- Cada consulta frecuente (por usuario, por juego, por fecha) tiene su índice,
-- así la base sigue rápida con muchos usuarios y muchas filas.
create index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_created_idx       on public.profiles (created_at);
create index if not exists comments_user_idx          on public.comments (user_id, created_at desc);
create index if not exists favorites_game_idx         on public.favorites (game_id);
create index if not exists poll_votes_user_idx        on public.poll_votes (user_id);
create index if not exists poll_votes_option_idx      on public.poll_votes (option_id);
create index if not exists poll_options_poll_idx      on public.poll_options (poll_id, sort_order);
create index if not exists polls_game_idx             on public.polls (game_id, created_at desc);
create index if not exists suggestions_user_idx       on public.suggestions (user_id, created_at desc);
create index if not exists suggestions_game_idx       on public.suggestions (game_id);
create index if not exists contact_user_idx           on public.contact_messages (user_id, created_at desc);
create index if not exists contact_email_idx          on public.contact_messages (email, created_at desc);
create index if not exists contact_unread_idx         on public.contact_messages (is_read, created_at desc);
create index if not exists news_published_idx         on public.news (published, created_at desc);
create index if not exists visits_user_path_idx       on public.visits (user_id, path, created_at desc);
create index if not exists donations_user_idx         on public.donations (user_id, created_at desc);
create index if not exists donations_status_idx       on public.donations (status, created_at desc);

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
  if new.supporter is distinct from old.supporter and auth.uid() is not null and not public.is_admin() then
    raise exception 'No tenés permiso para cambiar la insignia de donador';
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
      'suggestions_open', (select count(*) from public.suggestions where status in ('nueva', 'en_revision')),
      'visits_today',     (select count(*) from public.visits where created_at >= current_date),
      'active_today',     (select count(distinct user_id) from public.visits where created_at >= current_date),
      'active_7d',        (select count(distinct user_id) from public.visits where created_at > now() - interval '7 days'),
      'donations_total',  (select coalesce(round(sum(public.donation_in_ars(amount, currency))), 0) from public.donations where status = 'aprobada'),
      'donations_count',  (select count(*) from public.donations where status = 'aprobada')
    ),
    'visits', (
      select coalesce(json_agg(json_build_object('day', d.day, 'count', coalesce(v.count, 0), 'users', coalesce(v.users, 0)) order by d.day), '[]'::json)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (
        select created_at::date as day, count(*) as count, count(distinct user_id) as users
        from public.visits where created_at >= current_date - 29
        group by 1
      ) v on v.day = d.day
    ),
    'top_pages', (
      select coalesce(json_agg(t), '[]'::json) from (
        select path as title, count(*) as count from public.visits
        where created_at > now() - interval '30 days'
        group by path order by count desc limit 8) t
    ),
    'signups', (
      select coalesce(json_agg(json_build_object('day', d.day, 'count', coalesce(p.count, 0)) order by d.day), '[]'::json)
      from (select generate_series(current_date - 29, current_date, interval '1 day')::date as day) d
      left join (
        select created_at::date as day, count(*) as count
        from public.profiles where created_at >= current_date - 29
        group by 1
      ) p on p.day = d.day
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
alter table public.visits           enable row level security;
alter table public.donations        enable row level security;
alter table public.settings         enable row level security;
alter table public.game_codes       enable row level security;
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
  using ((select auth.uid()) = id or (select public.is_admin()))
  with check ((select auth.uid()) = id or (select public.is_admin()));

-- Juegos: todos los ven, solo el admin los modifica.
drop policy if exists "games_select" on public.games;
create policy "games_select" on public.games for select using (true);
drop policy if exists "games_admin" on public.games;
create policy "games_admin" on public.games for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Noticias: se ven las publicadas; el admin ve y modifica todo.
drop policy if exists "news_select" on public.news;
create policy "news_select" on public.news for select using (published or (select public.is_admin()));
drop policy if exists "news_admin" on public.news;
create policy "news_admin" on public.news for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Favoritos: cada usuario maneja los suyos.
drop policy if exists "favorites_public" on public.favorites;
create policy "favorites_public" on public.favorites for select
  using (exists (select 1 from public.profiles p where p.id = user_id and p.show_favorites));
drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Comentarios: todos leen los visibles; los ocultos solo el autor y el admin.
-- Comentan los usuarios logueados que no están baneados. Borran el autor o el admin.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select
  using (not hidden or (select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert
  with check ((select auth.uid()) = user_id and not hidden and not (select public.is_banned()));
drop policy if exists "comments_update_admin" on public.comments;
create policy "comments_update_admin" on public.comments for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "comments_delete" on public.comments;
create policy "comments_delete" on public.comments for delete
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- Contacto: cualquiera envía; solo el admin lee/gestiona.
drop policy if exists "contact_insert" on public.contact_messages;
create policy "contact_insert" on public.contact_messages for insert
  with check (user_id is null or user_id = (select auth.uid()));
drop policy if exists "contact_admin" on public.contact_messages;
create policy "contact_admin" on public.contact_messages for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Palabras prohibidas: solo el admin.
drop policy if exists "banned_words_admin" on public.banned_words;
create policy "banned_words_admin" on public.banned_words for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Equipo, galería, cambios y encuestas: todos los ven, solo el admin los modifica.
drop policy if exists "team_select" on public.team_members;
create policy "team_select" on public.team_members for select using (true);
drop policy if exists "team_admin" on public.team_members;
create policy "team_admin" on public.team_members for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "media_select" on public.game_media;
create policy "media_select" on public.game_media for select using (true);
drop policy if exists "media_admin" on public.game_media;
create policy "media_admin" on public.game_media for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "updates_select" on public.game_updates;
create policy "updates_select" on public.game_updates for select using (true);
drop policy if exists "updates_admin" on public.game_updates;
create policy "updates_admin" on public.game_updates for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "polls_select" on public.polls;
create policy "polls_select" on public.polls for select using (true);
drop policy if exists "polls_admin" on public.polls;
create policy "polls_admin" on public.polls for all using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "poll_options_select" on public.poll_options;
create policy "poll_options_select" on public.poll_options for select using (true);
drop policy if exists "poll_options_admin" on public.poll_options;
create policy "poll_options_admin" on public.poll_options for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- Votos: cada uno ve y cambia el suyo, solo si la encuesta está abierta y no está baneado.
drop policy if exists "votes_select" on public.poll_votes;
create policy "votes_select" on public.poll_votes for select using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "votes_insert" on public.poll_votes;
create policy "votes_insert" on public.poll_votes for insert with check (
  (select auth.uid()) = user_id and not (select public.is_banned()) and exists (
    select 1 from public.polls p where p.id = poll_id and p.active and (p.closes_at is null or p.closes_at > now())));
drop policy if exists "votes_update" on public.poll_votes;
create policy "votes_update" on public.poll_votes for update using ((select auth.uid()) = user_id) with check (
  (select auth.uid()) = user_id and not (select public.is_banned()) and exists (
    select 1 from public.polls p where p.id = poll_id and p.active and (p.closes_at is null or p.closes_at > now())));
drop policy if exists "votes_delete" on public.poll_votes;
create policy "votes_delete" on public.poll_votes for delete using ((select auth.uid()) = user_id);

-- Sugerencias y bugs: cada uno ve los suyos; el admin ve y gestiona todos.
drop policy if exists "suggestions_select" on public.suggestions;
create policy "suggestions_select" on public.suggestions for select using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "suggestions_insert" on public.suggestions;
create policy "suggestions_insert" on public.suggestions for insert
  with check ((select auth.uid()) = user_id and status = 'nueva' and not (select public.is_banned()));
drop policy if exists "suggestions_admin" on public.suggestions;
create policy "suggestions_admin" on public.suggestions for update using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "suggestions_delete" on public.suggestions;
create policy "suggestions_delete" on public.suggestions for delete using ((select public.is_admin()));

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
  with check (bucket_id = 'media' and (select public.is_admin()));
drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update" on storage.objects for update
  using (bucket_id = 'media' and (select public.is_admin()));
drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete" on storage.objects for delete
  using (bucket_id = 'media' and (select public.is_admin()));

-- =====================================================================
-- FOTOS DE PERFIL (Supabase Storage): carpeta pública "avatars".
-- Todos pueden ver las fotos; cada uno sube, reemplaza o borra solo las suyas,
-- guardadas dentro de una carpeta con su propio user id (ej: avatars/<uid>/foto.webp).
-- El admin puede borrar cualquiera (moderación).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (select auth.uid())::text = split_part(name, '/', 1) and not (select public.is_banned()));
drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update" on storage.objects for update
  using (bucket_id = 'avatars' and (select auth.uid())::text = split_part(name, '/', 1));
drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and ((select auth.uid())::text = split_part(name, '/', 1) or (select public.is_admin())));

-- =====================================================================
-- BORRAR MI CUENTA (derecho de supresión, Ley 25.326)
-- Borra el usuario; por las relaciones "on delete cascade" también se borran
-- su perfil, favoritos, comentarios, votos y reportes.
-- =====================================================================
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from anon;

-- =====================================================================
-- VISITAS: cada página que abre un usuario con sesión se anota acá.
-- Se usa una función (y no un insert directo) para limitar a 1 registro
-- por página cada 5 minutos y no llenar la tabla si alguien recarga mucho.
-- =====================================================================
drop policy if exists "visits_admin" on public.visits;
create policy "visits_admin" on public.visits for select using ((select public.is_admin()));

create or replace function public.log_visit(p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  clean text := left(coalesce(nullif(trim(p_path), ''), '/'), 200);
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.visits
             where user_id = auth.uid() and path = clean and created_at > now() - interval '5 minutes') then
    return;
  end if;
  insert into public.visits (user_id, path) values (auth.uid(), clean);
end;
$$;
revoke execute on function public.log_visit(text) from anon;

-- =====================================================================
-- DONACIONES: cada uno ve las suyas; el admin ve todas.
-- (No hay políticas de insert/update: solo la Edge Function puede escribir.)
-- =====================================================================
drop policy if exists "donations_select" on public.donations;
create policy "donations_select" on public.donations for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "donations_admin" on public.donations;
create policy "donations_admin" on public.donations for update using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "donations_admin_delete" on public.donations;
create policy "donations_admin_delete" on public.donations for delete using ((select public.is_admin()));

-- Cuando una donación se aprueba, el usuario recibe la insignia de donador
create or replace function public.mark_supporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprobada' and new.user_id is not null then
    update public.profiles set supporter = true where id = new.user_id and not supporter;
  end if;
  return new;
end;
$$;
drop trigger if exists donations_supporter on public.donations;
create trigger donations_supporter after insert or update of status on public.donations
  for each row execute function public.mark_supporter();

-- Avisar una donación hecha por fuera (transferencia, cripto, Robux): queda "por confirmar"
-- hasta que el admin la revise en el panel.
create or replace function public.report_manual_donation(
  p_provider text, p_amount numeric, p_currency text, p_message text default null, p_show_name boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Tenés que iniciar sesión'; end if;
  if p_provider not in ('transferencia', 'cripto', 'robux', 'paypal', 'payoneer', 'otro') then raise exception 'Método inválido'; end if;
  if (select count(*) from public.donations
      where user_id = auth.uid() and status = 'por_confirmar' and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ya avisaste varias donaciones hoy. Esperá a que las confirmemos.';
  end if;
  insert into public.donations (user_id, amount, currency, message, status, provider, show_name)
  values (auth.uid(), p_amount, upper(p_currency), nullif(trim(p_message), ''), 'por_confirmar', p_provider, coalesce(p_show_name, true))
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.report_manual_donation(text, numeric, text, text, boolean) from anon;

-- Ajustes: todos los leen, solo el admin los cambia
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings for select using (true);
drop policy if exists "settings_admin" on public.settings;
create policy "settings_admin" on public.settings for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- Códigos: se ven los activos; el admin ve y edita todos.
-- Los "de lanzamiento" quedan ocultos (nadie puede leerlos, ni mirando la API) hasta que
-- sale el juego: cuando llega su fecha de salida o cuando el admin lo marca como publicado.
alter table public.game_codes add column if not exists on_launch boolean not null default false;
drop policy if exists "codes_select" on public.game_codes;
create policy "codes_select" on public.game_codes for select using (
  (active and (not on_launch or exists (
    select 1 from public.games g where g.id = game_id
      and (g.status = 'publicado' or (g.release_at is not null and g.release_at <= now())))))
  or (select public.is_admin()));
drop policy if exists "codes_admin" on public.game_codes;
create policy "codes_admin" on public.game_codes for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- Pasa cualquier donación aprobada a pesos, para la meta del mes y el ranking
create or replace function public.donation_in_ars(amount numeric, currency text)
returns numeric language sql stable set search_path = public as $$
  select amount * case upper(currency)
    when 'ARS' then 1
    when 'USD' then coalesce((select (value->>'usd_rate')::numeric from public.settings where key = 'donation_goal'), 1000)
    when 'USDT' then coalesce((select (value->>'usd_rate')::numeric from public.settings where key = 'donation_goal'), 1000)
    when 'ROBUX' then coalesce((select (value->>'robux_rate')::numeric from public.settings where key = 'donation_goal'), 10)
    else 0 end;
$$;

-- Muro de donadores y meta del mes (público: solo nombres de quienes aceptaron aparecer)
create or replace function public.donation_wall()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'goal', (select value from public.settings where key = 'donation_goal'),
    'month_total', (select coalesce(round(sum(public.donation_in_ars(amount, currency))), 0) from public.donations
                    where status = 'aprobada' and created_at >= date_trunc('month', now())),
    'month_count', (select count(*) from public.donations where status = 'aprobada' and created_at >= date_trunc('month', now())),
    'supporters', (select count(distinct user_id) from public.donations where status = 'aprobada'),
    'top', (select coalesce(json_agg(t), '[]'::json) from (
      select p.username, p.avatar_url, p.roblox_username, count(*) as count
      from public.donations d join public.profiles p on p.id = d.user_id
      where d.status = 'aprobada' and d.show_name
      group by p.id order by sum(public.donation_in_ars(d.amount, d.currency)) desc limit 10) t),
    'recent', (select coalesce(json_agg(t), '[]'::json) from (
      select p.username, p.avatar_url, p.roblox_username, d.message, d.created_at
      from public.donations d join public.profiles p on p.id = d.user_id
      where d.status = 'aprobada' and d.show_name
      order by d.created_at desc limit 8) t)
  );
$$;

-- Compatibilidad con la versión anterior
create or replace function public.donation_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'total', (select coalesce(sum(public.donation_in_ars(amount, currency)), 0) from public.donations where status = 'aprobada'),
    'count', (select count(*) from public.donations where status = 'aprobada')
  );
$$;

-- =====================================================================
-- LÍMITES ANTI-SPAM: nadie puede mandar cientos de cosas por minuto.
-- Uso: trigger ... execute function public.rate_limit('máximo', 'intervalo')
-- (el admin no tiene límite)
-- =====================================================================
create or replace function public.rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  max_rows int := tg_argv[0]::int;
  window_len interval := tg_argv[1]::interval;
  recent int;
  data jsonb := to_jsonb(new);
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if data->>'user_id' is not null then
    execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - $2', tg_table_name)
      into recent using (data->>'user_id')::uuid, window_len;
  elsif tg_table_name = 'contact_messages' then
    select count(*) into recent from public.contact_messages
      where email = data->>'email' and created_at > now() - window_len;
  else
    return new;
  end if;
  if recent >= max_rows then
    raise exception 'Estás yendo muy rápido. Esperá un momento y probá de nuevo.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments
  for each row execute function public.rate_limit('5', '1 minute');
drop trigger if exists suggestions_rate_limit on public.suggestions;
create trigger suggestions_rate_limit before insert on public.suggestions
  for each row execute function public.rate_limit('5', '1 hour');
drop trigger if exists contact_rate_limit on public.contact_messages;
create trigger contact_rate_limit before insert on public.contact_messages
  for each row execute function public.rate_limit('3', '10 minutes');

-- =====================================================================
-- LIMPIEZA AUTOMÁTICA: borra datos viejos que ya no hacen falta, para que
-- la base no crezca sin control. Si activás pg_cron (Database → Extensions),
-- corre sola todos los días a las 4:15 (UTC). También se puede correr a mano:
--   select public.prune_old_data();
-- =====================================================================
create or replace function public.prune_old_data()
returns json language plpgsql security definer set search_path = public as $$
declare
  v int; d int; c int;
begin
  delete from public.visits where created_at < now() - interval '180 days';
  get diagnostics v = row_count;
  -- intentos de pago que nunca se completaron
  update public.donations set status = 'cancelada' where status = 'pendiente' and created_at < now() - interval '2 days';
  delete from public.donations where status = 'cancelada' and created_at < now() - interval '90 days';
  get diagnostics d = row_count;
  -- el chat público guarda los últimos 30 días
  delete from public.chat_messages where created_at < now() - interval '30 days';
  get diagnostics c = row_count;
  return json_build_object('visits_deleted', v, 'donations_deleted', d, 'chat_deleted', c);
end;
$$;
revoke execute on function public.prune_old_data() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('aquino-limpieza-diaria', '15 4 * * *', 'select public.prune_old_data()');
  end if;
end $$;

-- =====================================================================
-- PERFILES PÚBLICOS: todo lo que se muestra en perfil.html?u=usuario,
-- en una sola consulta y solo con datos públicos.
-- =====================================================================
create or replace function public.public_profile(p_username text)
returns json language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else json_build_object(
    'username', p.username, 'avatar_url', p.avatar_url, 'roblox_username', p.roblox_username, 'bio', p.bio,
    'role', p.role, 'supporter', p.supporter, 'banned', p.banned, 'created_at', p.created_at,
    'show_favorites', p.show_favorites,
    'comments_count', (select count(*) from public.comments c where c.user_id = p.id and not c.hidden),
    'favorites_count', (select count(*) from public.favorites f where f.user_id = p.id),
    'votes_count', (select count(*) from public.poll_votes v where v.user_id = p.id),
    'favorites', case when p.show_favorites then (
      select coalesce(json_agg(json_build_object('title', g.title, 'slug', g.slug, 'status', g.status, 'genre', g.genre,
        'thumbnail_url', g.thumbnail_url, 'roblox_place_id', g.roblox_place_id) order by f.created_at desc), '[]'::json)
      from public.favorites f join public.games g on g.id = f.game_id where f.user_id = p.id) else '[]'::json end,
    'recent_comments', (
      select coalesce(json_agg(t), '[]'::json) from (
        select c.id, c.body, c.created_at, g.title as game_title, g.slug as game_slug
        from public.comments c join public.games g on g.id = c.game_id
        where c.user_id = p.id and not c.hidden
        order by c.created_at desc limit 10) t)
  ) end
  from (select 1) one left join public.profiles p on lower(p.username) = lower(p_username);
$$;

-- =====================================================================
-- NOTIFICACIONES AL ADMIN (WhatsApp, Telegram, Discord o email)
-- Cuando pasa algo importante (donación, mensaje, reporte...), la base llama a la
-- Edge Function "notify" (con pg_net, sin frenar a quien hizo la acción) y la función
-- manda el aviso por los canales configurados. Se activa desde Panel → Notificaciones.
-- La URL y la clave se guardan en el esquema "private", que la API no expone.
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (
  key   text primary key,
  value text not null
);
revoke all on private.config from public, anon, authenticated;
-- Además, Row Level Security sin políticas: aunque alguien llegara a la tabla, no ve nada.
-- (Las funciones del sistema la leen igual porque son de su dueño.)
alter table private.config enable row level security;

insert into public.settings (key, value)
values ('notify_events', '{"donations": true, "messages": true, "reports": true, "comments": false, "signups": false}')
on conflict (key) do nothing;

create or replace function public.send_notification(p_event text, p_text text)
returns void language plpgsql security definer set search_path = public, private as $$
declare
  url text; secret text;
begin
  if p_event <> 'test' and not coalesce((select (value->>p_event)::boolean from public.settings where key = 'notify_events'), false) then
    return;
  end if;
  select value into url from private.config where key = 'notify_url';
  select value into secret from private.config where key = 'notify_secret';
  if url is null or secret is null or to_regproc('net.http_post') is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using url, jsonb_build_object('event', p_event, 'text', left(p_text, 1500)),
          jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret);
exception when others then
  raise warning 'Notificación no enviada: %', sqlerrm; -- nunca frena lo que hizo el usuario
end;
$$;
revoke execute on function public.send_notification(text, text) from public, anon, authenticated;

create or replace function public.notify_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text; game text; money text;
begin
  if to_jsonb(new) ? 'user_id' then
    select username into who from public.profiles where id = (to_jsonb(new)->>'user_id')::uuid;
  end if;
  if tg_table_name = 'donations' then
    money := case new.currency when 'ARS' then '$' || replace(to_char(new.amount, 'FM999,999,990'), ',', '.') || ' ARS'
                               when 'USD' then 'US$' || new.amount else new.amount || ' ' || new.currency end;
    if new.status = 'aprobada' and (tg_op = 'INSERT' or old.status is distinct from 'aprobada') then
      perform public.send_notification('donations', '💙 Donación aprobada: ' || money || ' por ' || new.provider
        || ' de ' || coalesce(who, 'alguien') || coalesce(E'\n«' || new.message || '»', ''));
    elsif new.status = 'por_confirmar' and tg_op = 'INSERT' then
      perform public.send_notification('donations', '⏳ Donación para confirmar: ' || money || ' por ' || new.provider
        || ' de ' || coalesce(who, 'alguien') || coalesce(E'\n«' || new.message || '»', '') || E'\nRevisala en Panel → Donaciones.');
    end if;
  elsif tg_table_name = 'contact_messages' then
    perform public.send_notification('messages', '✉️ Mensaje de ' || new.name || ' (' || new.email || E'):\n' || left(new.message, 500));
  elsif tg_table_name = 'suggestions' then
    select title into game from public.games where id = new.game_id;
    perform public.send_notification('reports', case new.kind when 'bug' then '🐞 Bug' else '💡 Sugerencia' end
      || coalesce(' en ' || game, '') || ' de ' || coalesce(who, 'alguien') || ': ' || new.title || E'\n' || left(new.body, 400));
  elsif tg_table_name = 'comments' then
    select title into game from public.games where id = new.game_id;
    perform public.send_notification('comments', '💬 ' || coalesce(who, 'Alguien') || ' comentó en ' || coalesce(game, 'un juego') || ': ' || left(new.body, 300));
  elsif tg_table_name = 'profiles' then
    perform public.send_notification('signups', '🎉 Nuevo usuario: ' || new.username);
  end if;
  return new;
end;
$$;

drop trigger if exists donations_notify on public.donations;
create trigger donations_notify after insert or update of status on public.donations
  for each row execute function public.notify_event();
drop trigger if exists contact_notify on public.contact_messages;
create trigger contact_notify after insert on public.contact_messages for each row execute function public.notify_event();
drop trigger if exists suggestions_notify on public.suggestions;
create trigger suggestions_notify after insert on public.suggestions for each row execute function public.notify_event();
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments for each row execute function public.notify_event();
drop trigger if exists profiles_notify on public.profiles;
create trigger profiles_notify after insert on public.profiles for each row execute function public.notify_event();

-- Panel: activar (genera la clave secreta la primera vez), ver el estado y mandar una prueba
create or replace function public.notify_setup(p_url text)
returns json language plpgsql security definer set search_path = public, private as $$
declare
  secret text;
begin
  if not public.is_admin() then raise exception 'Solo para admins'; end if;
  if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/notify$' then raise exception 'URL inválida'; end if;
  insert into private.config (key, value) values ('notify_url', p_url)
    on conflict (key) do update set value = excluded.value;
  select value into secret from private.config where key = 'notify_secret';
  if secret is null then
    secret := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into private.config (key, value) values ('notify_secret', secret);
  end if;
  return json_build_object('secret', secret, 'pg_net', to_regproc('net.http_post') is not null);
end;
$$;
revoke execute on function public.notify_setup(text) from public, anon;
grant execute on function public.notify_setup(text) to authenticated;

create or replace function public.notify_status()
returns json language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins'; end if;
  return json_build_object(
    'configured', exists (select 1 from private.config where key = 'notify_secret'),
    'pg_net', to_regproc('net.http_post') is not null,
    'events', (select value from public.settings where key = 'notify_events'));
end;
$$;
revoke execute on function public.notify_status() from public, anon;
grant execute on function public.notify_status() to authenticated;

create or replace function public.notify_test()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo para admins'; end if;
  perform public.send_notification('test', '✅ Prueba de notificaciones de Aquino Studios: ¡funciona!');
end;
$$;
revoke execute on function public.notify_test() from public, anon;
grant execute on function public.notify_test() to authenticated;

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
-- LANZAMIENTOS: qué recompensa trae cada juego que todavía no salió, SIN revelar el código.
-- (El código en sí lo protege la regla "codes_select" de arriba.)
-- =====================================================================
create or replace function public.launch_teasers(p_game_id bigint default null)
returns table (game_id bigint, rewards text[], total int)
language sql stable security definer set search_path = public as $$
  select c.game_id, array_agg(coalesce(c.reward, 'Recompensa sorpresa') order by c.id), count(*)::int
  from public.game_codes c join public.games g on g.id = c.game_id
  where c.active and c.on_launch
    and not (g.status = 'publicado' or (g.release_at is not null and g.release_at <= now()))
    and (p_game_id is null or c.game_id = p_game_id)
  group by c.game_id;
$$;

-- =====================================================================
-- CHAT PÚBLICO: todos lo leen; para escribir hay que tener cuenta (y no estar suspendido).
-- Límite anti-spam, filtro de palabras, el admin oculta o borra, y cada uno puede borrar
-- lo suyo. Se guardan los últimos 30 días (ver prune_old_data).
-- =====================================================================
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 400),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_recent_idx on public.chat_messages(created_at desc);
create index if not exists chat_messages_user_idx on public.chat_messages(user_id, created_at desc);
alter table public.chat_messages enable row level security;

drop policy if exists "chat_select" on public.chat_messages;
create policy "chat_select" on public.chat_messages for select using (not hidden or (select public.is_admin()));
drop policy if exists "chat_insert" on public.chat_messages;
create policy "chat_insert" on public.chat_messages for insert to authenticated
  with check ((select auth.uid()) = user_id and not hidden and not (select public.is_banned()));
drop policy if exists "chat_update_admin" on public.chat_messages;
create policy "chat_update_admin" on public.chat_messages for update
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "chat_delete" on public.chat_messages;
create policy "chat_delete" on public.chat_messages for delete
  using ((select auth.uid()) = user_id or (select public.is_admin()));

drop trigger if exists chat_banned_words on public.chat_messages;
create trigger chat_banned_words before insert or update of body on public.chat_messages
  for each row execute function public.check_banned_words();
drop trigger if exists chat_rate_limit on public.chat_messages;
create trigger chat_rate_limit before insert on public.chat_messages
  for each row execute function public.rate_limit('6', '30 seconds');

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- =====================================================================
-- ESTADÍSTICAS DE LOS JUGADORES (las manda el juego de Roblox)
-- El juego llama a la Edge Function "game-events" con una clave secreta, y la función
-- guarda los datos con ingest_player_stats (que solo puede usar el servidor).
-- Todos pueden verlas: salen en la tabla de récords del juego y en los perfiles.
-- =====================================================================
create table if not exists public.player_stats (
  game_id         bigint not null references public.games(id) on delete cascade,
  roblox_user_id  bigint not null check (roblox_user_id > 0),
  roblox_username text not null check (roblox_username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name    text check (char_length(display_name) <= 40),
  best_stage      int not null default 0 check (best_stage >= 0),
  wins            int not null default 0 check (wins >= 0),
  deaths          int not null default 0 check (deaths >= 0),
  best_time_ms    int check (best_time_ms > 0),
  playtime_s      bigint not null default 0 check (playtime_s >= 0),
  sessions        int not null default 0 check (sessions >= 0),
  first_seen      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (game_id, roblox_user_id)
);
create index if not exists player_stats_rank_idx on public.player_stats(game_id, best_stage desc, best_time_ms asc nulls last);
create index if not exists player_stats_name_idx on public.player_stats(lower(roblox_username));
alter table public.player_stats enable row level security;
drop policy if exists "player_stats_select" on public.player_stats;
create policy "player_stats_select" on public.player_stats for select using (true);
drop policy if exists "player_stats_admin" on public.player_stats;
create policy "player_stats_admin" on public.player_stats for delete using ((select public.is_admin()));

-- p_players: [{ userId, username, displayName, stage, bestTimeMs, wins, deaths, playtime, joined }]
--   stage y bestTimeMs son el récord (se queda el mejor);
--   wins, deaths y playtime (segundos) son lo que sumó DESDE EL ÚLTIMO ENVÍO;
--   joined = true la primera vez que se manda en esa partida (cuenta una sesión más).
create or replace function public.ingest_player_stats(p_game text, p_players jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  gid bigint; n int := 0; p jsonb;
begin
  select id into gid from public.games where slug = p_game or roblox_place_id::text = p_game limit 1;
  if gid is null then raise exception 'Juego desconocido: %', p_game; end if;
  if jsonb_typeof(p_players) <> 'array' then raise exception 'players tiene que ser una lista'; end if;
  for p in select * from jsonb_array_elements(p_players) limit 100 loop
    continue when coalesce(p->>'userId', '') !~ '^[1-9][0-9]{0,15}$'
             or coalesce(p->>'username', '') !~ '^[A-Za-z0-9_]{3,20}$';
    insert into public.player_stats as s (game_id, roblox_user_id, roblox_username, display_name,
        best_stage, best_time_ms, wins, deaths, playtime_s, sessions)
    values (gid, (p->>'userId')::bigint, p->>'username', left(p->>'displayName', 40),
        least(greatest(coalesce((p->>'stage')::int, 0), 0), 100000),
        nullif(greatest(coalesce((p->>'bestTimeMs')::int, 0), 0), 0),
        least(greatest(coalesce((p->>'wins')::int, 0), 0), 1000),
        least(greatest(coalesce((p->>'deaths')::int, 0), 0), 100000),
        least(greatest(coalesce((p->>'playtime')::int, 0), 0), 86400),
        case when coalesce((p->>'joined')::boolean, false) then 1 else 0 end)
    on conflict (game_id, roblox_user_id) do update set
      roblox_username = excluded.roblox_username,
      display_name    = coalesce(excluded.display_name, s.display_name),
      best_stage      = greatest(s.best_stage, excluded.best_stage),
      best_time_ms    = case when s.best_time_ms is null then excluded.best_time_ms
                             when excluded.best_time_ms is null then s.best_time_ms
                             else least(s.best_time_ms, excluded.best_time_ms) end,
      wins            = s.wins + excluded.wins,
      deaths          = s.deaths + excluded.deaths,
      playtime_s      = s.playtime_s + excluded.playtime_s,
      sessions        = s.sessions + excluded.sessions,
      updated_at      = now();
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.ingest_player_stats(text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_player_stats(text, jsonb) to service_role;

-- Resumen para la tabla de récords: jugadores totales, partidas, muertes, etc.
create or replace function public.player_stats_summary(p_game_id bigint)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('players', count(*), 'wins', coalesce(sum(wins), 0), 'deaths', coalesce(sum(deaths), 0),
    'playtime_s', coalesce(sum(playtime_s), 0), 'best_stage', coalesce(max(best_stage), 0))
  from public.player_stats where game_id = p_game_id;
$$;

-- =====================================================================
-- DATOS DE EJEMPLO (solo se cargan si no hay juegos; podés borrarlos desde el panel)
-- =====================================================================
insert into public.games (title, slug, genre, status, short_description, description, featured, sort_order)
select * from (values
  ('Mi Primer Juego', 'mi-primer-juego', 'Aventura', 'publicado',
   'Editá este juego desde el panel de administración.',
   'Esta es una descripción de ejemplo. Entrá a /admin.html para cambiar el título, la imagen, el ID del lugar de Roblox y todo lo demás.',
   true, 1),
  ('Próximo Proyecto', 'proximo-proyecto', 'Simulador', 'en_desarrollo',
   'Un juego que todavía está en desarrollo.',
   'Descripción de ejemplo para un juego en desarrollo.',
   false, 2)
) as ejemplo(title, slug, genre, status, short_description, description, featured, sort_order)
where not exists (select 1 from public.games) -- solo si el sitio no tiene ningún juego todavía
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
