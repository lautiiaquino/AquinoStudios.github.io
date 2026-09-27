// Aquino Studios — Edge Function "donate"
// Crea un pago de Mercado Pago (Checkout Pro) para una donación y devuelve el link de pago.
// El Access Token de Mercado Pago queda guardado como secreto en Supabase: nunca llega al navegador.
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   MP_ACCESS_TOKEN  → tu Access Token de producción de Mercado Pago (APP_USR-...)
//   SITE_URL         → (opcional) la dirección del sitio, por defecto la de GitHub Pages
//
// Uso desde el sitio:  supabase.functions.invoke('donate', { body: { amount: 1000, message: '¡Grande!' } })

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MIN = 100;        // ARS
const MAX = 1_000_000;  // ARS

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) return json({ error: "Las donaciones todavía no están configuradas." }, 503);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Quién está donando (tiene que haber iniciado sesión): se valida su token con Supabase Auth
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!user) return json({ error: "Tenés que iniciar sesión para donar." }, 401);

  let amount: number, message: string | null;
  try {
    const body = await req.json();
    amount = Math.round(Number(body.amount));
    message = typeof body.message === "string" ? body.message.trim().slice(0, 200) || null : null;
  } catch {
    return json({ error: "Pedido inválido" }, 400);
  }
  if (!Number.isFinite(amount) || amount < MIN || amount > MAX) {
    return json({ error: `El monto tiene que ser entre $${MIN} y $${MAX.toLocaleString("es-AR")}.` }, 400);
  }

  // Freno anti-abuso: como mucho 5 intentos de donación pendientes en 10 minutos
  const { count } = await admin.from("donations").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("status", "pendiente").gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 5) return json({ error: "Esperá unos minutos antes de volver a intentar." }, 429);

  const { data: donation, error } = await admin.from("donations")
    .insert({ user_id: user.id, amount, message }).select("id").single();
  if (error) return json({ error: "No se pudo registrar la donación." }, 500);

  const site = (Deno.env.get("SITE_URL") ?? "https://lautiiaquino.github.io/AquinoStudios.github.io/").replace(/\/?$/, "/");
  const back = (estado: string) => `${site}index.html?donacion=${estado}`;

  const mp = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": donation.id,
    },
    body: JSON.stringify({
      items: [{ id: "donacion", title: "Donación a Aquino Studios", quantity: 1, unit_price: amount, currency_id: "ARS" }],
      external_reference: donation.id,
      back_urls: { success: back("aprobada"), pending: back("pendiente"), failure: back("fallida") },
      auto_return: "approved",
      notification_url: `${url}/functions/v1/mp-webhook`,
      statement_descriptor: "AQUINO STUDIOS",
      payer: user.email ? { email: user.email } : undefined,
    }),
  });
  if (!mp.ok) {
    console.error("Mercado Pago", mp.status, await mp.text());
    await admin.from("donations").update({ status: "cancelada" }).eq("id", donation.id);
    return json({ error: "Mercado Pago no respondió. Probá de nuevo en un rato." }, 502);
  }
  const pref = await mp.json();
  return json({ url: pref.init_point, id: donation.id });
});
