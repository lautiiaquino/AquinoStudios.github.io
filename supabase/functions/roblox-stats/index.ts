// Aquino Studios — Edge Function "roblox-stats"
// Recibe IDs de lugares de Roblox y devuelve jugadores activos, visitas,
// favoritos e ícono de cada juego. Hace falta porque las APIs de Roblox
// no se pueden llamar directamente desde el navegador (CORS).
//
// Uso desde el sitio:  supabase.functions.invoke('roblox-stats', { body: { placeIds: [123, 456] } })

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });

// Cache en memoria (dura mientras la instancia de la función esté viva).
const universeCache = new Map<number, number>();

async function placeToUniverse(placeId: number): Promise<number | null> {
  if (universeCache.has(placeId)) return universeCache.get(placeId)!;
  const r = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  if (!r.ok) return null;
  const { universeId } = await r.json();
  if (typeof universeId === "number") universeCache.set(placeId, universeId);
  return universeId ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let placeIds: number[];
  try {
    const body = await req.json();
    placeIds = [...new Set((body.placeIds ?? []).map(Number))]
      .filter((n) => Number.isSafeInteger(n) && n > 0)
      .slice(0, 50) as number[];
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (placeIds.length === 0) return json({});

  try {
    const pairs = await Promise.all(placeIds.map(async (p) => [p, await placeToUniverse(p)] as const));
    const byUniverse = new Map<number, number>();
    for (const [place, uni] of pairs) if (uni) byUniverse.set(uni, place);
    if (byUniverse.size === 0) return json({});

    const ids = [...byUniverse.keys()].join(",");
    const [gamesRes, votesRes, iconsRes] = await Promise.all([
      fetch(`https://games.roblox.com/v1/games?universeIds=${ids}`),
      fetch(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`),
      fetch(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=512x512&format=Png&isCircular=false`),
    ]);
    const games = gamesRes.ok ? (await gamesRes.json()).data ?? [] : [];
    const votes = votesRes.ok ? (await votesRes.json()).data ?? [] : [];
    const icons = iconsRes.ok ? (await iconsRes.json()).data ?? [] : [];

    const out: Record<string, unknown> = {};
    for (const g of games) {
      const v = votes.find((x: { id: number }) => x.id === g.id);
      const i = icons.find((x: { targetId: number }) => x.targetId === g.id);
      out[byUniverse.get(g.id)!] = {
        universeId: g.id,
        name: g.name,
        playing: g.playing ?? 0,
        visits: g.visits ?? 0,
        favorites: g.favoritedCount ?? 0,
        maxPlayers: g.maxPlayers ?? null,
        updated: g.updated ?? null,
        upVotes: v?.upVotes ?? 0,
        downVotes: v?.downVotes ?? 0,
        icon: i?.state === "Completed" ? i.imageUrl : null,
      };
    }
    return json(out);
  } catch (e) {
    return json({ error: "No se pudo contactar a Roblox", detail: String(e) }, 502);
  }
});
