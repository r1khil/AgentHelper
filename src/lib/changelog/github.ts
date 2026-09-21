import "server-only";

export type MergedPull = { number: number; title: string; body: string | null; author: string; mergedAt: string; url: string };
export type PullFile = { path: string; additions: number; deletions: number };

const DEFAULT_REPO = "r1khil/AgentHelper";

export function changelogConfigured() {
  return Boolean(process.env.GITHUB_TOKEN);
}

export function changelogRepo() {
  return process.env.GITHUB_REPO || DEFAULT_REPO;
}

async function gh<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not configured");
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return (await res.json()) as T;
}

type PullJson = {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: { name: string }[];
};

/** Pull requests merged into main, newest first. Skips housekeeping PRs. */
export async function listMergedPulls(): Promise<MergedPull[]> {
  const rows = await gh<PullJson[]>(`/repos/${changelogRepo()}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=50`);
  return rows
    .filter((p) => p.merged_at && !/^chore\b/i.test(p.title) && !p.labels.some((l) => l.name === "skip-changelog"))
    .map((p) => ({ number: p.number, title: p.title, body: p.body, author: p.user?.login ?? "unknown", mergedAt: p.merged_at as string, url: p.html_url }))
    .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt) || b.number - a.number);
}

/** Files touched by one pull request. Called once per PR, when its summary is written. */
export async function pullFiles(number: number): Promise<PullFile[]> {
  const rows = await gh<{ filename: string; additions: number; deletions: number }[]>(`/repos/${changelogRepo()}/pulls/${number}/files?per_page=100`);
  return rows.map((f) => ({ path: f.filename, additions: f.additions, deletions: f.deletions }));
}
