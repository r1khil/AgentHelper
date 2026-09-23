import { after } from "next/server";
import { answerEmail, hootInboxId } from "@/lib/email/answer";
import { verifyOpenMailSignature, type InboundEvent } from "@/lib/email/inbound";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * OpenMail calls this when someone emails hoot@omail.sh. It must answer within 15 seconds, so the reply
 * (receipt, research, answer) runs after the response.
 */
export async function POST(req: Request) {
  const secret = process.env.OPENMAIL_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const rawBody = await req.text();
  if (!verifyOpenMailSignature({ rawBody, timestamp: req.headers.get("x-timestamp"), signature: req.headers.get("x-signature"), secret })) {
    return new Response("Bad signature", { status: 400 });
  }
  const ev = JSON.parse(rawBody) as InboundEvent;
  if (ev.event !== "message.received" || !ev.message) return Response.json({ ok: true, ignored: ev.event });
  const inbox = await hootInboxId();
  if (inbox && ev.inbox_id !== inbox) return Response.json({ ok: true, ignored: "other inbox" });

  after(async () => {
    const r = await answerEmail(ev).catch((e) => ({ status: "failed", reason: e instanceof Error ? e.message : String(e) }));
    console.log(`[openmail] ${ev.message.id} from ${ev.message.from}: ${r.status}${"reason" in r && r.reason ? ` (${r.reason})` : ""}`);
  });
  return Response.json({ ok: true });
}
