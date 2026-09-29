import { redirect } from "next/navigation";
import { withQuery } from "@/components/app/portfolio/redirects";

/** Exposure is a view of the Portfolio now; old links keep their lookback and sector view. */
export default async function ExposurePage({ searchParams }: PageProps<"/exposure">) {
  redirect(withQuery("/t/fund/exposure", await searchParams));
}
