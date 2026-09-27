// Aquino Studios — Edge Function "donate"
// Crea el pago de una donación y devuelve el link para pagar. Soporta:
//   mercadopago → Checkout Pro (pesos: tarjeta, débito, dinero en cuenta, efectivo)
//   paypal      → PayPal Orders v2 (dólares: cuenta PayPal o tarjeta)
//   stripe      → Stripe Checkout (dólares: tarjetas de todo el mundo, Apple Pay, Google Pay)
// Las claves quedan guardadas como secretos en Supabase: nunca llegan al navegador.
//
// Secretos (Supabase > Edge Functions > Secrets). Cargá solo los de los métodos que uses:
//   MP_ACCESS_TOKEN                     → Mercado Pago (APP_USR-... o TEST-...)
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET     → PayPal (y PAYPAL_ENV=sandbox para probar)
//   STRIPE_SECRET_KEY                   → Stripe (sk_live_... o sk_test_...)
//   SITE_URL                            → (opcional) dirección del sitio
//
// Uso: supabase.functions.invoke('donate', { body: { provider: 'paypal', amount: 5, message: '¡Grande!', show_name: true } })

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Moneda y montos permitidos por método
const PROVIDERS: Record<string, { currency: string; min: number; max: number; secret: string }> = {
  mercadopago: { currency: "ARS", min: 100, max: 1_000_000, secret: "MP_ACCESS_TOKEN" },
  paypal: { currency: "USD", min: 1, max: 1000, secret: "PAYPAL_SECRET" },
  stripe: { currency: "USD", min: 1, max: 1000, secret: "STRIPE_SECRET_KEY" },
};

const env = (k: string) => Deno.env.get(k) ?? "";
const TITLE = "Donación a Aquino Studios";

async function paypalToken(base: string) {
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env("PAYPAL_CLIENT_ID")}:${env("PAYPAL_SECRET")}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal token ${r.status}`);
  return (await r.json()).access_token as string;
}
const paypalBase = () => env("PAYPAL_ENV") === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido" }, 400); }
  const provider = String(body.provider ?? "mercadopago");
  const conf = PROVIDERS[provider];
  if (!conf) return json({ error: "Método de pago inválido" }, 400);
  if (!env(conf.secret)) return json({ error: "Este método de pago todavía no está configurado." }, 503);

  const url = env("SUPABASE_URL");
  const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));

  // Quién dona (tiene que haber iniciado sesión): se valida su token con Supabase Auth
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = jwt ? await admin.auth.getUser(jwt) : { data: { user: null } };
  if (!user) return json({ error: "Tenés que iniciar sesión para donar." }, 401);

  const amount = conf.currency === "ARS" ? Math.round(Number(body.amount)) : Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < conf.min || amount > conf.max) {
    return json({ error: `El monto tiene que ser entre ${conf.min} y ${conf.max.toLocaleString("es-AR")} ${conf.currency}.` }, 400);
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 200) || null : null;
  const showName = body.show_name !== false;

  // Freno anti-abuso: como mucho 5 intentos pendientes en 10 minutos
  const { count } = await admin.from("donations").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("status", "pendiente").gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count ?? 0) >= 5) return json({ error: "Esperá unos minutos antes de volver a intentar." }, 429);

  const { data: donation, error } = await admin.from("donations")
    .insert({ user_id: user.id, amount, currency: conf.currency, message, provider, show_name: showName }).select("id").single();
  if (error) return json({ error: "No se pudo registrar la donación." }, 500);

  const site = (env("SITE_URL") || "https://lautiiaquino.github.io/AquinoStudios.github.io/").replace(/\/?$/, "/");
  const back = (estado: string) => `${site}index.html?donacion=${estado}&metodo=${provider}`;
  const fail = async (what: string, detail: unknown) => {
    console.error(what, detail);
    await admin.from("donations").update({ status: "cancelada" }).eq("id", donation.id);
    return json({ error: `${what} no respondió. Probá de nuevo en un rato.` }, 502);
  };

  try {
    if (provider === "mercadopago") {
      const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("MP_ACCESS_TOKEN")}`, "Content-Type": "application/json", "X-Idempotency-Key": donation.id },
        body: JSON.stringify({
          items: [{ id: "donacion", title: TITLE, quantity: 1, unit_price: amount, currency_id: "ARS" }],
          external_reference: donation.id,
          back_urls: { success: back("aprobada"), pending: back("pendiente"), failure: back("fallida") },
          auto_return: "approved",
          notification_url: `${url}/functions/v1/mp-webhook`,
          statement_descriptor: "AQUINO STUDIOS",
          payer: user.email ? { email: user.email } : undefined,
        }),
      });
      if (!r.ok) return await fail("Mercado Pago", await r.text());
      const pref = await r.json();
      await admin.from("donations").update({ provider_ref: pref.id }).eq("id", donation.id);
      return json({ url: pref.init_point, id: donation.id });
    }

    if (provider === "paypal") {
      const base = paypalBase();
      const token = await paypalToken(base);
      const r = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": donation.id },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{ reference_id: donation.id, custom_id: donation.id, description: TITLE, amount: { currency_code: "USD", value: amount.toFixed(2) } }],
          application_context: {
            brand_name: "Aquino Studios", user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING", locale: "es-AR",
            return_url: back("confirmar"), cancel_url: back("fallida"),
          },
        }),
      });
      if (!r.ok) return await fail("PayPal", await r.text());
      const order = await r.json();
      const approve = order.links?.find((l: { rel: string }) => l.rel === "approve" || l.rel === "payer-action")?.href;
      if (!approve) return await fail("PayPal", order);
      await admin.from("donations").update({ provider_ref: order.id }).eq("id", donation.id);
      return json({ url: approve, id: donation.id });
    }

    // Stripe Checkout (la API usa formularios, no JSON)
    const form = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(Math.round(amount * 100)),
      "line_items[0][price_data][product_data][name]": TITLE,
      success_url: `${back("confirmar")}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: back("fallida"),
      client_reference_id: donation.id,
      "metadata[donation_id]": donation.id,
      submit_type: "donate",
      locale: "es",
    });
    if (user.email) form.set("customer_email", user.email);
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": donation.id },
      body: form,
    });
    if (!r.ok) return await fail("Stripe", await r.text());
    const session = await r.json();
    await admin.from("donations").update({ provider_ref: session.id }).eq("id", donation.id);
    return json({ url: session.url, id: donation.id });
  } catch (e) {
    return await fail(provider === "paypal" ? "PayPal" : provider === "stripe" ? "Stripe" : "Mercado Pago", e);
  }
});
