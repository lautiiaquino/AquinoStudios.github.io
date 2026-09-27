// Aquino Studios — Edge Function "donate-confirm"
// Cuando volvés de pagar con PayPal o Stripe, el sitio llama a esta función con el id del pago.
// La función NO confía en lo que manda el navegador: le pregunta a PayPal / Stripe el estado real
// del pago (con las claves secretas) y recién ahí marca la donación como aprobada.
//
// Uso: supabase.functions.invoke('donate-confirm', { body: { provider: 'paypal', ref: 'ORDER_ID' } })
//      supabase.functions.invoke('donate-confirm', { body: { provider: 'stripe', ref: 'cs_...' } })

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const paypalBase = () => env("PAYPAL_ENV") === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

async function paypalToken() {
  const r = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env("PAYPAL_CLIENT_ID")}:${env("PAYPAL_SECRET")}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal token ${r.status}`);
  return (await r.json()).access_token as string;
}

// Devuelve { status, amount?, paymentId? } según el proveedor
async function checkPaypal(orderId: string) {
  const token = await paypalToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // Intentar cobrar la orden (si ya estaba cobrada, se consulta)
  let r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, { method: "POST", headers });
  if (!r.ok) r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}`, { headers });
  if (!r.ok) return { status: "pendiente" };
  const order = await r.json();
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (order.status === "COMPLETED" && capture?.status === "COMPLETED") {
    return { status: "aprobada", amount: Number(capture.amount?.value), paymentId: capture.id };
  }
  if (order.status === "VOIDED") return { status: "cancelada" };
  return { status: "pendiente" };
}

async function checkStripe(sessionId: string) {
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` },
  });
  if (!r.ok) return { status: "pendiente" };
  const s = await r.json();
  if (s.payment_status === "paid") return { status: "aprobada", amount: s.amount_total / 100, paymentId: s.payment_intent };
  if (s.status === "expired") return { status: "cancelada" };
  return { status: "pendiente" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  let provider = "", ref = "";
  try { ({ provider, ref } = await req.json()); } catch { return json({ error: "Pedido inválido" }, 400); }
  if (!["paypal", "stripe"].includes(provider) || typeof ref !== "string" || !/^[A-Za-z0-9_-]{5,120}$/.test(ref)) {
    return json({ error: "Pedido inválido" }, 400);
  }

  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: donation } = await admin.from("donations").select("id, status").eq("provider", provider).eq("provider_ref", ref).maybeSingle();
  if (!donation) return json({ error: "No encontramos esa donación." }, 404);
  if (donation.status === "aprobada") return json({ status: "aprobada" });

  try {
    const res = provider === "paypal" ? await checkPaypal(ref) : await checkStripe(ref);
    if (res.status !== donation.status) {
      await admin.from("donations").update({
        status: res.status,
        ...(res.amount ? { amount: res.amount } : {}),
        ...(res.paymentId ? { mp_payment_id: String(res.paymentId) } : {}),
        paid_at: res.status === "aprobada" ? new Date().toISOString() : null,
      }).eq("id", donation.id);
    }
    return json({ status: res.status });
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos confirmar el pago ahora. Si se cobró, va a aparecer en unos minutos." }, 502);
  }
});
