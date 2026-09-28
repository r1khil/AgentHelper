export type Source = {
  id: string;
  title: string;
  url?: string;
  /** Indexed documents open in the app; ids never serve as URLs. */
  documentId?: string;
  sourceType?: string;
  excerpt?: string;
  location?: { page?: number; section?: string; text?: string; offset?: number };
  publisher: string;
  publishedAt?: string;
  retrievedAt: string;
};

export type Bar = { date: string; close: number; open?: number; high?: number; low?: number; volume?: number };

export type Quote = {
  symbol: string;
  name?: string;
  price: number;
  previousClose?: number;
  changePct?: number;
  marketState?: string;
  asOf: string;
  currency?: string;
  marketCap?: number;
  exchange?: string;
};

export type Filing = {
  accession: string;
  form: string;
  filedAt: string;
  reportDate?: string;
  description?: string;
  items?: string;
  primaryDocument: string;
  url: string;
  indexUrl: string;
};

export type NewsItem = {
  id: string;
  headline: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: string;
};

export type EarningsDate = {
  date: string;
  hour?: "bmo" | "amc" | "dmh" | string;
  isEstimate: boolean;
  epsEstimate?: number;
  revenueEstimate?: number;
  /** ISO codes for the estimates. They can differ: TSM's EPS is per ADR in USD, its revenue is in TWD. */
  epsCurrency?: string;
  revenueCurrency?: string;
  fiscalPeriod?: string;
  sourceUrl?: string;
};

export function sourceId(prefix: string, key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}
