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
  wanted text := left(regexp_replace(coalesce(
    meta->>'username', meta->>'user_name', meta->>'preferred_username', meta->>'full_name', meta->>'name', ''
  ), '[^A-Za-z0-9_]', '', 'g'), 20);
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

-- =====================================================================
-- SEGURIDAD (Row Level Security)
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.games            enable row level security;
alter table public.news             enable row level security;
alter table public.favorites        enable row level security;
alter table public.comments         enable row level security;
alter table public.contact_messages enable row level security;

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

-- Comentarios: todos los leen; usuarios logueados comentan; se borran por el autor o el admin.
drop policy if exists "comments_select" on public.comments;
create policy "comments_select" on public.comments for select using (true);
drop policy if exists "comments_insert" on public.comments;
create policy "comments_insert" on public.comments for insert
  with check (auth.uid() = user_id);
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
