import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getDailyBars, SPX_SYMBOL } = await import("../src/lib/providers/yahoo");
  const t = process.argv[2] ?? "NVDA";
  const min = Number(process.argv[3] ?? 3.5);
  const [h, s] = await Promise.all([getDailyBars(t, 120), getDailyBars(SPX_SYMBOL, 120)]);
  const sp = new Map(s.map((b) => [b.date, b.close]));
  const prev = new Map<string, number>();
  for (let i = 1; i < s.length; i++) prev.set(s[i].date, s[i - 1].close);
  for (let i = 1; i < h.length; i++) {
    const d = h[i].date;
    const sc = sp.get(d);
    const spv = prev.get(d);
    if (!sc || !spv) continue;
    const rel = (h[i].close / h[i - 1].close - 1) * 100 - (sc / spv - 1) * 100;
    if (Math.abs(rel) >= min) console.log(d, rel.toFixed(2));
  }
}
main();
