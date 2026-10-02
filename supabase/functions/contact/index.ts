// Aquino Studios — Edge Function "contact"
// Recibe el formulario de Contacto del inicio y, antes de guardarlo, comprueba la
// verificación "No soy un robot" (Cloudflare Turnstile) del lado del servidor.
// Antes, ese formulario se guardaba directo desde el navegador y el captcha de la página
// no lo verificaba nadie, así que un bot podía mandar mensajes igual.
//
// Secreto (Supabase > Edge Functions > Secrets):
//   TURNSTILE_SECRET_KEY → la misma Secret Key del widget de Turnstile que ya usás para
//                           el login (Cloudflare Dashboard > Turnstile > tu widget).
//                           Sin este secreto cargado, la función no exige la verificación
//                           (sirve para antes de activar el captcha, o si no lo usás).
//
// Publicar SIN verificación de JWT (lo llama cualquier visitante, con o sin cuenta):
//   supabase functions deploy contact --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";

async function captchaOk(token: string, ip: string | null) {
  const secret = env("TURNSTILE_SECRET_KEY");
  if (!secret) return true; // captcha no configurado del lado del servidor: no se exige
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return !!(await r.json())?.success;
  } catch {
    return false; // si Cloudflare no responde, mejor no dejar pasar
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const message = String(body?.message ?? "").trim();
  if (!name || name.length > 80) return json({ error: "Escribí tu nombre." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Escribí un email válido." }, 400);
  if (!message || message.length > 2000) return json({ error: "Escribí tu mensaje." }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await captchaOk(String(body?.captchaToken ?? ""), ip))) {
    return json({ error: "Completá la verificación \"No soy un robot\" y probá de nuevo." }, 400);
  }

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  // Si inició sesión, se guarda quién es (el trigger de la base igual limita por usuario;
  // acá, para quien no tiene cuenta, se limita a mano por email).
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = jwt ? await admin.auth.getUser(jwt).catch(() => ({ data: { user: null } })) : { data: { user: null } };

  if (!user) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await admin.from("contact_messages").select("id", { count: "exact", head: true })
      .eq("email", email).is("user_id", null).gte("created_at", since);
    if ((count ?? 0) >= 3) return json({ error: "Estás yendo muy rápido. Esperá un momento y probá de nuevo." }, 429);
  }

  const { error } = await admin.from("contact_messages").insert({ name, email, message, user_id: user?.id ?? null });
  if (error) return json({ error: "No se pudo enviar el mensaje. Probá de nuevo." }, 500);
  return json({ ok: true });
});
