// Aquino Studios — Edge Function "roblox-stats"
// Consulta las APIs públicas de Roblox (desde el navegador no se puede por CORS).
//
// Usos desde el sitio:
//   { placeIds: [123, 456] }                → jugadores, visitas, favoritos, votos e ícono de cada juego
//   { action: 'details', placeId: 123 }     → datos de la página del juego: imágenes, tienda (game passes),
//                                              servidores públicos e insignias
//   { action: 'avatars', usernames: [...] } → foto (headshot) del avatar de Roblox de cada usuario
//
// supabase.functions.invoke('roblox-stats', { body: { ... } })

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200, maxAge = 60) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });

// deno-lint-ignore no-explicit-any
type Any = any;
const getJson = async (url: string, init?: RequestInit): Promise<Any | null> => {
  try {
    const r = await fetch(url, init);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

// Cache en memoria (dura mientras la instancia de la función esté viva).
const universeCache = new Map<number, number>();
const avatarCache = new Map<string, { at: number; value: Any }>();

async function placeToUniverse(placeId: number): Promise<number | null> {
  if (universeCache.has(placeId)) return universeCache.get(placeId)!;
  const data = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  const universeId = data?.universeId;
  if (typeof universeId === "number") universeCache.set(placeId, universeId);
  return typeof universeId === "number" ? universeId : null;
}

// Íconos de badges / game passes en lote → { id: url }
async function thumbs(kind: "badges/icons" | "game-passes", param: string, ids: number[]) {
  if (!ids.length) return {} as Record<number, string>;
  const data = await getJson(`https://thumbnails.roblox.com/v1/${kind}?${param}=${ids.join(",")}&size=150x150&format=Png&isCircular=false`);
  const out: Record<number, string> = {};
  for (const t of data?.data ?? []) if (t.state === "Completed") out[t.targetId] = t.imageUrl;
  return out;
}

// ---------- Estadísticas de varios juegos (lo que ya usaba el sitio) ----------
async function stats(placeIds: number[]) {
  const pairs = await Promise.all(placeIds.map(async (p) => [p, await placeToUniverse(p)] as const));
  const byUniverse = new Map<number, number>();
  for (const [place, uni] of pairs) if (uni) byUniverse.set(uni, place);
  if (byUniverse.size === 0) return {};

  const ids = [...byUniverse.keys()].join(",");
  const [games, votes, icons] = await Promise.all([
    getJson(`https://games.roblox.com/v1/games?universeIds=${ids}`),
    getJson(`https://games.roblox.com/v1/games/votes?universeIds=${ids}`),
    getJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids}&size=512x512&format=Png&isCircular=false`),
  ]);
  const out: Record<string, unknown> = {};
  for (const g of games?.data ?? []) {
    const v = (votes?.data ?? []).find((x: Any) => x.id === g.id);
    const i = (icons?.data ?? []).find((x: Any) => x.targetId === g.id);
    out[byUniverse.get(g.id)!] = {
      universeId: g.id,
      name: g.name,
      playing: g.playing ?? 0,
      visits: g.visits ?? 0,
      favorites: g.favoritedCount ?? 0,
      maxPlayers: g.maxPlayers ?? null,
      created: g.created ?? null,
      updated: g.updated ?? null,
      genre: g.genre ?? null,
      creator: g.creator?.name ?? null,
      upVotes: v?.upVotes ?? 0,
      downVotes: v?.downVotes ?? 0,
      icon: i?.state === "Completed" ? i.imageUrl : null,
    };
  }
  return out;
}

// ---------- Página del juego: imágenes, tienda, servidores e insignias ----------
async function details(placeId: number) {
  const universeId = await placeToUniverse(placeId);
  if (!universeId) return { error: "No se encontró el juego en Roblox" };

  const [media, passesNew, badges, servers] = await Promise.all([
    getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=10&size=768x432&format=Png&defaults=true`),
    getJson(`https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes?passView=Full&pageSize=50`),
    getJson(`https://badges.roblox.com/v1/universes/${universeId}/badges?limit=100&sortOrder=Asc`),
    getJson(`https://games.roblox.com/v1/games/${placeId}/servers/Public?sortOrder=Desc&excludeFullGames=false&limit=25`),
  ]);

  // Game passes: API nueva y, si falla, la vieja
  let passes: Any[] = (passesNew?.gamePasses ?? []).map((p: Any) => ({ id: p.id, name: p.displayName ?? p.name, description: p.description ?? "", price: p.price ?? null, forSale: p.isForSale ?? p.price != null }));
  if (!passes.length) {
    const legacy = await getJson(`https://games.roblox.com/v1/games/${universeId}/game-passes?limit=100&sortOrder=Asc`);
    passes = (legacy?.data ?? []).map((p: Any) => ({ id: p.id, name: p.displayName ?? p.name, description: "", price: p.price ?? null, forSale: p.price != null }));
  }
  const badgeList = (badges?.data ?? []).filter((b: Any) => b.enabled !== false);
  const [passIcons, badgeIcons] = await Promise.all([
    thumbs("game-passes", "gamePassIds", passes.map((p) => p.id)),
    thumbs("badges/icons", "badgeIds", badgeList.map((b: Any) => b.id)),
  ]);

  return {
    universeId,
    images: (media?.data?.[0]?.thumbnails ?? []).filter((t: Any) => t.state === "Completed").map((t: Any) => t.imageUrl),
    passes: passes.map((p) => ({ ...p, icon: passIcons[p.id] ?? null })),
    badges: badgeList.map((b: Any) => ({
      id: b.id,
      name: b.displayName ?? b.name,
      description: b.displayDescription ?? b.description ?? "",
      awarded: b.statistics?.awardedCount ?? 0,
      rate: b.statistics?.winRatePercentage ?? null,
      icon: badgeIcons[b.id] ?? null,
    })),
    servers: (servers?.data ?? []).map((s: Any) => ({ id: s.id, playing: s.playing ?? 0, maxPlayers: s.maxPlayers ?? 0, ping: s.ping ?? null, fps: s.fps ?? null })),
  };
}

// ---------- Avatares de Roblox por nombre de usuario ----------
async function avatars(usernames: string[]) {
  const out: Record<string, unknown> = {};
  const todo: string[] = [];
  for (const u of usernames) {
    const c = avatarCache.get(u);
    if (c && Date.now() - c.at < 3_600_000) out[u] = c.value;
    else todo.push(u);
  }
  if (todo.length) {
    const users = await getJson("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: todo, excludeBannedUsers: true }),
    });
    const found = (users?.data ?? []) as Any[];
    const ids = found.map((u) => u.id);
    const heads = ids.length
      ? await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.join(",")}&size=150x150&format=Png&isCircular=false`)
      : null;
    for (const name of todo) {
      const u = found.find((x) => String(x.requestedUsername).toLowerCase() === name.toLowerCase());
      const h = u && (heads?.data ?? []).find((x: Any) => x.targetId === u.id);
      const value = u ? { id: u.id, name: u.name, displayName: u.displayName, headshot: h?.state === "Completed" ? h.imageUrl : null } : null;
      avatarCache.set(name, { at: Date.now(), value });
      out[name] = value;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  try {
    if (body.action === "details") {
      const placeId = Number(body.placeId);
      if (!Number.isSafeInteger(placeId) || placeId <= 0) return json({ error: "placeId inválido" }, 400);
      return json(await details(placeId), 200, 30);
    }
    if (body.action === "avatars") {
      const names = [...new Set<string>((body.usernames ?? []).map(String))]
        .filter((n) => /^[A-Za-z0-9_]{3,20}$/.test(n)).slice(0, 50);
      return json(names.length ? await avatars(names) : {}, 200, 3600);
    }
    const placeIds = [...new Set((body.placeIds ?? []).map(Number))]
      .filter((n) => Number.isSafeInteger(n) && (n as number) > 0).slice(0, 50) as number[];
    return json(placeIds.length ? await stats(placeIds) : {});
  } catch (e) {
    return json({ error: "No se pudo contactar a Roblox", detail: String(e) }, 502);
  }
});
