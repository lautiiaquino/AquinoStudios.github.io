// Aquino Studios — Edge Function "notify"
// La base de datos la llama cuando pasa algo importante (donaciones, mensajes, reportes...)
// y esta función manda el aviso por TODOS los canales que tengas configurados.
// Solo acepta pedidos que traigan la clave secreta (NOTIFY_SECRET) que genera el panel.
//
// Secretos (Supabase > Edge Functions > Secrets). Cargá solo los canales que quieras usar:
//   NOTIFY_SECRET                          → la clave que te muestra Panel → Notificaciones (obligatoria)
//   CALLMEBOT_PHONE, CALLMEBOT_APIKEY      → WhatsApp gratis con CallMeBot (ej: +5491122334455)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   → Telegram (bot propio, gratis)
//   DISCORD_WEBHOOK_URL                    → un canal de tu servidor de Discord
//   RESEND_API_KEY, NOTIFY_EMAIL           → email con Resend (gratis hasta 100 por día)
//
// Publicar SIN verificación de JWT (la llama la base, no un usuario):
//   supabase functions deploy notify --no-verify-jwt

const env = (k: string) => Deno.env.get(k) ?? "";
const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

// Compara la clave en tiempo constante (no da pistas midiendo cuánto tarda)
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SITE = () => (env("SITE_URL") || "https://lautiiaquino.github.io/AquinoStudios.github.io/").replace(/\/?$/, "/");

async function whatsapp(text: string) {
  const phone = env("CALLMEBOT_PHONE"), key = env("CALLMEBOT_APIKEY");
  if (!phone || !key) return null;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  return r.ok;
}

async function telegram(text: string) {
  const token = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
  if (!token || !chat) return null;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
  });
  return r.ok;
}

async function discord(text: string) {
  const hook = env("DISCORD_WEBHOOK_URL");
  if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(hook)) return null;
  const r = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Aquino Studios", content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
  });
  return r.ok;
}

async function email(event: string, text: string) {
  const key = env("RESEND_API_KEY"), to = env("NOTIFY_EMAIL");
  if (!key || !to) return null;
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("NOTIFY_FROM") || "Aquino Studios <onboarding@resend.dev>",
      to: [to],
      subject: `[Aquino Studios] ${text.split("\n")[0].slice(0, 90)}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escape(text).replace(/\n/g, "<br>")}
        <p style="margin-top:20px"><a href="${SITE()}admin.html">Abrir el panel de admin</a></p>
        <p style="color:#888;font-size:12px">Aviso automático (${escape(event)}).</p></div>`,
    }),
  });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Método no permitido" }, 405);
  if (!sameSecret(req.headers.get("x-notify-secret") ?? "", env("NOTIFY_SECRET"))) return ok({ error: "No autorizado" }, 401);

  let event = "", text = "";
  try {
    const body = await req.json();
    event = String(body.event ?? "evento").slice(0, 40);
    text = String(body.text ?? "").slice(0, 1500);
  } catch {
    return ok({ error: "Pedido inválido" }, 400);
  }
  if (!text) return ok({ error: "Sin texto" }, 400);
  const full = `${text}\n\n${SITE()}admin.html`;

  // Se manda por todos los canales a la vez; si uno falla, los otros igual salen
  const channels = { whatsapp: whatsapp(full), telegram: telegram(full), discord: discord(full), email: email(event, text) };
  const result: Record<string, string> = {};
  await Promise.all(Object.entries(channels).map(async ([name, p]) => {
    try {
      const r = await p;
      result[name] = r === null ? "no configurado" : r ? "enviado" : "error";
    } catch {
      result[name] = "error";
    }
  }));
  console.log(event, result);
  return ok({ event, result });
});
