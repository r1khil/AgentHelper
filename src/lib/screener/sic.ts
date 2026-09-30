import type { GicsSector } from "@/lib/attribution/sectors";

/*
 * SIC codes to GICS sectors, and which SIC codes the screen leaves out.
 *
 * SEC files every registrant under a four-digit SIC code; GICS is what the Fund's teams are organized by. The two
 * don't line up exactly, so this is a documented range table, imperfect by design: SIC 7370 ("computer programming,
 * data processing") holds Alphabet and Meta as well as IT-services firms, and is mapped to Communication Services
 * because the interactive-media giants dominate it by value; SIC 7389 ("business services, NEC") holds Visa and
 * PayPal as well as staffing and outsourcing firms, and is mapped to Industrials. Teams can still see every hit's SIC
 * code beside its sector.
 */

type Range = [from: number, to: number, sector: GicsSector];

/** First match wins, so narrow ranges sit above the broad ones they carve out of. */
const SIC_RANGES: Range[] = [
  // Agriculture, forestry, fishing
  [800, 899, "materials"], // forestry
  [100, 999, "consumer_staples"], // crops, livestock, agricultural services, fishing
  // Mining
  [1000, 1099, "materials"], // metal mining
  [1200, 1299, "energy"], // coal
  [1300, 1399, "energy"], // oil and gas extraction and services
  [1400, 1499, "materials"], // nonmetallic minerals
  // Construction
  [1520, 1531, "consumer_discretionary"], // homebuilders
  [1500, 1799, "industrials"],
  // Manufacturing
  [2000, 2199, "consumer_staples"], // food, beverages, tobacco
  [2200, 2399, "consumer_discretionary"], // textiles and apparel
  [2400, 2499, "materials"], // lumber and wood
  [2500, 2599, "consumer_discretionary"], // furniture
  [2600, 2699, "materials"], // paper and packaging
  [2700, 2799, "communication_services"], // publishing
  [2830, 2839, "health_care"], // drugs, biologics, diagnostics
  [2840, 2844, "consumer_staples"], // soap, cleaners, cosmetics
  [2800, 2899, "materials"], // other chemicals
  [2900, 2999, "energy"], // petroleum refining
  [3011, 3011, "consumer_discretionary"], // tires
  [3000, 3099, "materials"], // rubber and plastics
  [3100, 3199, "consumer_discretionary"], // leather and footwear
  [3200, 3399, "materials"], // stone, glass, primary metals
  [3400, 3499, "industrials"], // fabricated metal
  [3570, 3579, "information_technology"], // computers and office equipment
  [3500, 3599, "industrials"], // industrial machinery
  [3630, 3639, "consumer_discretionary"], // household appliances
  [3651, 3652, "consumer_discretionary"], // household audio and video
  [3660, 3679, "information_technology"], // communications equipment, semiconductors, components
  [3600, 3699, "industrials"], // other electrical equipment
  [3710, 3716, "consumer_discretionary"], // motor vehicles
  [3751, 3751, "consumer_discretionary"], // motorcycles and bicycles
  [3790, 3799, "consumer_discretionary"], // recreational vehicles
  [3700, 3799, "industrials"], // aircraft, ships, rail, defense vehicles, auto parts
  [3812, 3812, "industrials"], // defense electronics
  [3840, 3851, "health_care"], // medical instruments and supplies
  [3870, 3873, "consumer_discretionary"], // watches
  [3800, 3899, "information_technology"], // measuring and scientific instruments, photographic
  [3900, 3999, "consumer_discretionary"], // jewelry, toys, sporting goods
  // Transportation, communications, utilities
  [4600, 4619, "energy"], // pipelines
  [4000, 4799, "industrials"], // rail, trucking, air, water, logistics
  [4800, 4899, "communication_services"], // telecom, broadcasting, cable
  [4922, 4925, "energy"], // natural-gas transmission
  [4950, 4959, "industrials"], // waste
  [4900, 4999, "utilities"],
  // Wholesale
  [5045, 5045, "information_technology"], // computer wholesale
  [5047, 5047, "health_care"], // medical equipment wholesale
  [5122, 5122, "health_care"], // drug wholesale
  [5140, 5149, "consumer_staples"], // grocery wholesale
  [5170, 5172, "energy"], // petroleum wholesale
  [5000, 5199, "industrials"],
  // Retail
  [5331, 5331, "consumer_staples"], // variety stores (Walmart, Costco, Target, Dollar General)
  [5400, 5499, "consumer_staples"], // food stores
  [5912, 5912, "consumer_staples"], // drug stores
  [5200, 5999, "consumer_discretionary"],
  // Finance, insurance, real estate (most are excluded from the screen; see exclusionReason)
  [6500, 6599, "real_estate"],
  [6798, 6798, "real_estate"],
  [6000, 6799, "financials"],
  // Services
  [7000, 7099, "consumer_discretionary"], // hotels
  [7200, 7299, "consumer_discretionary"], // personal services
  [7310, 7319, "communication_services"], // advertising
  [7370, 7370, "communication_services"], // Alphabet, Meta (see the note above)
  [7371, 7379, "information_technology"], // software and IT services
  [7300, 7399, "industrials"], // business services, rental, staffing
  [7500, 7599, "industrials"], // auto rental and repair
  [7800, 7899, "communication_services"], // film, streaming
  [7900, 7999, "consumer_discretionary"], // amusement, casinos
  [8000, 8099, "health_care"], // health services
  [8200, 8299, "consumer_discretionary"], // education
  [8731, 8731, "health_care"], // commercial biological research
  [8000, 8999, "industrials"], // engineering, accounting, research, management
];

/** The GICS sector for a SIC code, or null when the code is missing or not in the table (9995 non-operating shells). */
export function sicToGics(sic: string | number | null | undefined): GicsSector | null {
  const code = Number(sic);
  if (!sic || !Number.isFinite(code)) return null;
  for (const [from, to, sector] of SIC_RANGES) if (code >= from && code <= to) return sector;
  return null;
}

/**
 * Why the screen leaves a company out, or null to keep it. EV/EBIT, ROIC and net debt mean little for lenders,
 * insurers and pass-through vehicles, so they are excluded:
 *   6000–6199 banks, thrifts and other lenders; 6211 broker-dealers; 6300–6411 insurers; 6770 SPACs and shells;
 *   6798 REITs; 6720–6799 other trusts, funds and holding vehicles; MLPs by name ("… L.P.", "Partners LP");
 *   9995 non-operating establishments. A company with no SIC code is left out as well.
 */
export function exclusionReason(p: { sic: string | null; name: string }): string | null {
  const code = Number(p.sic);
  if (!p.sic || !Number.isFinite(code)) return "No SIC code on file";
  if (code === 6770) return "SPAC or shell company";
  if (code >= 6000 && code <= 6199) return "Bank or lender";
  if (code === 6211) return "Broker-dealer";
  if (code >= 6300 && code <= 6411) return "Insurer";
  if (code === 6798) return "REIT";
  if (code >= 6720 && code <= 6799) return "Trust, fund or holding vehicle";
  if (code === 9995) return "Non-operating shell";
  if (isMlpName(p.name)) return "MLP";
  return null;
}

export function isMlpName(name: string) {
  return /\bL\.?\s?P\.?\s*$/i.test(name.trim()) || /limited partnership/i.test(name) || /\bpartners,?\s+l\.?\s?p\b/i.test(name);
}

/** Foreign private issuers (20-F, 40-F) report under IFRS or home GAAP; the screen lists them as not screened in v1. */
export function notScreenedReason(annualForm: string | null): string | null {
  if (annualForm === "20-F" || annualForm === "40-F") return `Files ${annualForm} (foreign issuer or ADR); not screened in v1`;
  if (!annualForm) return "No annual report on file";
  return null;
}
