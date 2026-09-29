import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";

/** Risk is a view of the Portfolio now; old links keep their lookback. */
export default async function RiskPage({ searchParams }: PageProps<"/risk">) {
  redirect(withQuery("/t/fund/risk", await searchParams));
}
