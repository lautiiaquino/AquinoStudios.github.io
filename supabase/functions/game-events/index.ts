// Aquino Studios — Edge Function "game-events"
// La llama el juego de Roblox (desde un Script del servidor con HttpService) para mandar
// las estadísticas de los jugadores: etapa máxima, mejor tiempo, victorias, muertes y tiempo jugado.
// Se guardan en la tabla player_stats y aparecen en la página del juego (Récords) y en los perfiles.
//
// Secreto (Supabase > Edge Functions > Secrets):
//   GAME_API_KEY → una clave larga inventada por vos (la misma que ponés en el juego)
//
// Publicar SIN verificación de JWT (la llama Roblox, no un usuario del sitio):
//   supabase functions deploy game-events --no-verify-jwt
//
// Pedido (POST, header "x-game-key: TU_CLAVE"):
//   { "game": "obby-imposible", "players": [
//       { "userId": 123, "username": "Pepe", "displayName": "Pepe", "stage": 12, "bestTimeMs": 0,
//         "wins": 0, "deaths": 4, "playtime": 60, "joined": true } ] }
// Ver supabase/roblox/AquinoStats.server.lua para el script listo para pegar en Roblox Studio.

const env = (k: string) => Deno.env.get(k) ?? "";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Compara la clave en tiempo constante (no da pistas midiendo cuánto tarda)
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const key = env("GAME_API_KEY");
  if (!key) return json({ error: "Falta configurar GAME_API_KEY en los secretos" }, 500);
  if (!sameSecret(req.headers.get("x-game-key") ?? "", key)) return json({ error: "Clave incorrecta" }, 401);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const game = String(body?.game ?? "").trim();
  const players = Array.isArray(body?.players) ? body.players.slice(0, 100) : null;
  if (!/^[a-z0-9-]{1,80}$|^[0-9]{1,20}$/.test(game)) return json({ error: "game inválido (usá el slug del juego)" }, 400);
  if (!players) return json({ error: "players tiene que ser una lista" }, 400);
  if (!players.length) return json({ saved: 0 });

  const r = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/ingest_player_stats`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ p_game: game, p_players: players }),
  });
  if (!r.ok) return json({ error: "No se pudo guardar", detail: (await r.text()).slice(0, 300) }, 502);
  return json({ saved: await r.json() });
});
