// Runs Hoot's email-reply handler on a made-up reply and prints the receipt and answer instead of sending them.
// Usage: npm run smoke:email-reply -- "Why did FIG underperform today?" [from@theowlfund.com]
// With --ticket=<file.docx> (repeatable) the email carries those trade tickets; they are read and checked
// against the ledger, but nothing is recorded.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: process.env.ENV_FILE ?? ".env.local" });

async function main() {
  const { answerEmail } = await import("../src/lib/email/answer");
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--ticket="));
  const question = args[0] ?? "Why did the FIG team underperform today?";
  const from = args[1] ?? "rsharma@theowlfund.com";
  // No OpenMail download URL here, so the handler reads the text the way OpenMail would have extracted it.
  const mammoth = await import("mammoth");
  const attachments = await Promise.all(
    process.argv.filter((a) => a.startsWith("--ticket=")).map(async (a) => {
      const path = a.slice("--ticket=".length);
      return { filename: path.split("/").pop()!, parsedText: (await mammoth.extractRawText({ path })).value };
    }),
  );
  const id = `smoke-${Date.now()}`;
  const r = await answerEmail(
    { event: "message.received", event_id: id, inbox_id: "", thread_id: "smoke", message: { id, from, to: process.env.OPENMAIL_INBOX ?? "hoot@omail.sh", subject: "Re: Owl Fund Daily Attribution Analysis", body_text: question, attachments } },
    { dryRun: (text) => console.log(`\n=== would send ===\n${text}\n`) },
  );
  console.log(JSON.stringify("tickets" in r || "weekEnding" in r ? r : { status: r.status, reason: r.reason, model: r.model, steps: r.steps }, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
