// Aquino Studios — Edge Function "mp-webhook"
// Mercado Pago avisa acá cuando cambia el estado de un pago.
// No se confía en lo que llega en el aviso: se vuelve a consultar el pago a la API
// de Mercado Pago con nuestro Access Token y recién ahí se actualiza la donación.
//
// Esta función se publica SIN verificación de JWT (Mercado Pago no manda token de Supabase):
//   supabase functions deploy mp-webhook --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";

const STATUS: Record<string, string> = {
  approved: "aprobada",
  authorized: "pendiente",
  pending: "pendiente",
  in_process: "pendiente",
  in_mediation: "pendiente",
  rejected: "rechazada",
  cancelled: "cancelada",
  refunded: "reembolsada",
  charged_back: "reembolsada",
};

Deno.serve(async (req) => {
  const ok = () => new Response("ok", { status: 200 });
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) return ok();

  // El id del pago puede venir en la URL (?data.id=... o ?id=...) o en el cuerpo
  const q = new URL(req.url).searchParams;
  let type = q.get("type") ?? q.get("topic");
  let paymentId = q.get("data.id") ?? q.get("id");
  try {
    const body = await req.json();
    type = body?.type ?? body?.topic ?? type;
    paymentId = body?.data?.id ?? paymentId;
  } catch { /* sin cuerpo */ }
  if (type !== "payment" || !paymentId || !/^\d+$/.test(String(paymentId))) return ok();

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return new Response("retry", { status: 500 }); // Mercado Pago reintenta más tarde
  const pay = await r.json();
  const id = pay.external_reference;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return ok();

  const status = STATUS[pay.status] ?? "pendiente";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("donations").update({
    status,
    mp_payment_id: String(pay.id),
    amount: pay.transaction_amount,
    currency: pay.currency_id ?? "ARS",
    paid_at: status === "aprobada" ? (pay.date_approved ?? new Date().toISOString()) : null,
  }).eq("id", id);
  if (error) return new Response("retry", { status: 500 });
  return ok();
});
