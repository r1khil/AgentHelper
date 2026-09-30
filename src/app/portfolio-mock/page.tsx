import type { Metadata } from "next";
import { PortfolioMock } from "@/components/app/portfolio-mock/workspace";

export const metadata: Metadata = {
  title: "Portfolio design mock",
  robots: { index: false, follow: false },
};

export default function PortfolioMockPage() {
  return <PortfolioMock />;
}
