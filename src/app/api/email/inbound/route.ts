import { after } from "next/server";
import { matchReplyAddress, readWebhookHeaders } from "@/lib/weekly/inbound";
import { recordReply } from "@/lib/weekly/replies";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type ReceivedEvent = { type?: string; data?: { email_id?: string; to?: string[]; received_for?: string[] } };

/**
 * Resend inbound email. Public by design: the svix signature made with RESEND_WEBHOOK_SECRET is the
 * auth. Only `email.received` is handled, and only when one of the addresses carries a token we
 * issued. Responds at once and reads the message after the response, like the Drive webhook.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new Response("Inbound email is not configured", { status: 500 });
  const headers = readWebhookHeaders(req.headers);
  if (!headers) return new Response("Missing signature headers", { status: 400 });
  const payload = await req.text();

  let event: ReceivedEvent;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = resend.webhooks.verify({ payload, headers, webhookSecret: secret }) as ReceivedEvent;
  } catch (e) {
    console.warn("[weekly] inbound signature rejected", e);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type !== "email.received") return new Response(null, { status: 200 });
  const emailId = event.data?.email_id;
  const match = matchReplyAddress([...(event.data?.to ?? []), ...(event.data?.received_for ?? [])], process.env.INBOUND_EMAIL_DOMAIN);
  if (!emailId || !match) return new Response(null, { status: 200 });

  after(async () => {
    try {
      await recordReply({ emailId, weekEnding: match.weekEnding, token: match.token });
    } catch (e) {
      console.warn("[weekly] inbound reply failed", e);
    }
  });
  return new Response(null, { status: 200 });
}

export function GET() {
  return new Response(null, { status: 405 });
}
