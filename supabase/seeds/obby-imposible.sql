-- =====================================================================
-- Carga el primer juego de Aquino Studios: OBBY IMPOSIBLE
-- Pegalo en Supabase → SQL Editor → New query → Run.
-- Se puede correr las veces que quieras: si el juego ya existe, lo actualiza.
-- =====================================================================

-- 1) Sacar los juegos y la noticia de ejemplo que venían con el sitio
delete from public.games where slug in ('mi-primer-juego', 'proximo-proyecto');
delete from public.news where title = '¡Bienvenidos a Aquino Studios!';

-- 2) El juego
insert into public.games (title, slug, genre, status, featured, sort_order, thumbnail_url, short_description, description)
values (
  'Obby Imposible',
  'obby-imposible',
  'Obby',
  'en_desarrollo',
  true,
  1,
  'https://lautiiaquino.github.io/AquinoStudios.github.io/img/games/obby-imposible.webp',
  '¿Podés llegar al final? El 99% no lo logra. Saltá, esquivá el fuego y juntá monedas en el obby más difícil de Roblox.',
  'Bienvenido al Obby Imposible, el primer juego de Aquino Studios.

Un camino arcoíris flotando en el cielo, lleno de trampas: plataformas que desaparecen, fuego, saltos al límite y bloques sorpresa "?" que pueden ayudarte… o no.

🟨 Juntá monedas en cada nivel.
🔥 Esquivá el fuego y las trampas.
❓ Arriesgate con los bloques sorpresa.
🏁 Llegá a la meta y demostrá que sos del 1% que lo logra.

Pensado para jugar solo o con amigos: compitan a ver quién llega más lejos sin caerse.

Está en desarrollo: votá en las encuestas y mandanos tus ideas desde "Sugerencias y bugs" para que lo hagamos juntos.'
)
on conflict (slug) do update set
  title = excluded.title, genre = excluded.genre, status = excluded.status, featured = excluded.featured,
  sort_order = excluded.sort_order, thumbnail_url = excluded.thumbnail_url,
  short_description = excluded.short_description, description = excluded.description;

-- Solo este juego queda como destacado en la portada
update public.games set featured = (slug = 'obby-imposible');

-- 3) Una novedad para anunciarlo
insert into public.news (title, body, game_id)
select '¡Nuestro primer juego está en camino: Obby Imposible!',
       'Estamos terminando Obby Imposible, un obby arcoíris lleno de trampas donde el 99% no llega al final. Muy pronto lo publicamos en Roblox. ¡Votá qué querés que tenga y mandanos tus ideas!',
       id
from public.games where slug = 'obby-imposible'
  and not exists (select 1 from public.news where title = '¡Nuestro primer juego está en camino: Obby Imposible!');

-- 4) Una encuesta para que la comunidad participe
with g as (select id from public.games where slug = 'obby-imposible'),
p as (
  insert into public.polls (question, game_id)
  select '¿Qué querés que tenga Obby Imposible?', g.id from g
  where not exists (select 1 from public.polls where question = '¿Qué querés que tenga Obby Imposible?')
  returning id
)
insert into public.poll_options (poll_id, label, sort_order)
select p.id, o.label, o.ord
from p, (values ('Más niveles', 0), ('Modo por equipos', 1), ('Tienda de skins', 2), ('Tabla de récords', 3)) as o(label, ord);

-- Cuando publiques el juego en Roblox: cambiá el estado y cargá el ID del lugar
-- (o hacelo desde Panel de admin → Juegos → Editar):
--   update public.games set status = 'publicado', roblox_place_id = 123456789 where slug = 'obby-imposible';
