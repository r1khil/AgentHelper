// Runs Hoot's email-reply handler on a made-up reply and prints the receipt and answer instead of sending them.
// Usage: npm run smoke:email-reply -- "Why did FIG underperform today?" [from@theowlfund.com]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: process.env.ENV_FILE ?? ".env.local" });

async function main() {
  const { answerEmail } = await import("../src/lib/email/answer");
  const question = process.argv[2] ?? "Why did the FIG team underperform today?";
  const from = process.argv[3] ?? "rsharma@theowlfund.com";
  const id = `smoke-${Date.now()}`;
  const r = await answerEmail(
    { event: "message.received", event_id: id, inbox_id: "", thread_id: "smoke", message: { id, from, to: process.env.OPENMAIL_INBOX ?? "hoot@omail.sh", subject: "Re: Owl Fund Daily Attribution Analysis", body_text: question } },
    { dryRun: (text) => console.log(`\n=== would send ===\n${text}\n`) },
  );
  console.log(JSON.stringify({ status: r.status, reason: r.reason, model: r.model, steps: r.steps }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
