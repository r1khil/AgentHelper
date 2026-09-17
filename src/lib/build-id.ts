// Identifies the running deployment. Vercel sets these per deploy; locally
// everything is "dev", so the update banner never shows.
export function getBuildId(): string {
  return process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";
}
