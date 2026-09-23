export const ANALYSIS_ERROR =
  "Your saved transcript is safe. The analysis could not finish. Retry analysis to continue; completed audio will not be transcribed again.";
export const TRANSCRIPT_ERROR = "Your audio is saved. Transcription could not finish. Retry to continue from the last saved step.";
export const callStatusLabel: Record<string, string> = {
  recording: "Ready to record",
  transcribing: "Preparing transcript",
  summarizing: "Preparing key points",
  analyzing: "Reviewing company evidence",
  ready: "Analysis ready",
  error: "Needs attention",
};
