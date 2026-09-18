/** One step of a background job, appended to job_runs.progress while the job runs. */
export type JobProgressEvent = {
  /** ISO timestamp. */
  at: string;
  kind: "step" | "item" | "warn" | "error";
  name: string;
  detail?: Record<string, unknown>;
  /** For per-item loops: item number and total. */
  n?: number;
  of?: number;
};
