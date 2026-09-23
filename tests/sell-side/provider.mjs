// Deterministic external-service fixtures. Application parsing, persistence and retries are real.
export const controls = {
  failNotes: 2,
  failAnalysis: 0,
  transcriptions: 0,
  notes: 0,
  analyses: 0,
  uploads: 0,
  chat: 0,
};
export const transcript =
  "We expect FY27 revenue of $3.2 billion, up 29% year over year. AI demand supports growth. Margins remain uncertain because of data center spending.";
export const internalSource = {
  id: "drive-model",
  documentId: "model-fixture",
  title: "Internal company model",
  publisher: "Analyst Drive",
  sourceType: "Internal document",
  retrievedAt: "2026-09-21",
  publishedAt: "2026-08-01",
  excerpt: "FY26 revenue: $2.8 billion.",
  location: { text: "FY26 revenue: $2.8 billion." },
};
function completion(content, reason = "stop") {
  return Response.json({
    id: "fixture",
    model: "fixture",
    created: 1,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        finish_reason: reason,
        message: {
          role: "assistant",
          content,
          ...(content === null ? { reasoning: "Output budget consumed" } : {}),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 700, total_tokens: 800 },
  });
}
export async function providerFetch(url, init) {
  if (String(url).includes("audio/transcriptions")) {
    controls.transcriptions++;
    return Response.json({
      segments: [{ start: 0, end: 8, text: transcript }],
    });
  }
  const body = JSON.parse(init.body);
  if (body.stream) {
    controls.chat++;
    const all = JSON.stringify(body.messages);
    const id = all.match(/\[src:(call-[\w-]+)\]/)?.[1] ?? "call-fixture";
    const text = `Margins remain uncertain because of data center spending. [src:${id}]`;
    const frames = [
      {
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      },
    ];
    return new Response(
      frames.map((f) => `data: ${JSON.stringify({ id: "chat-fixture", model: "fixture", created: 1, object: "chat.completion.chunk", ...f })}\n\n`).join("") +
        "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }
  const final = !!body.response_format?.json_schema?.schema?.properties?.overview;
  if (!final) {
    controls.notes++;
    if (controls.failNotes-- > 0) return completion(null, "length");
    return completion(
      JSON.stringify({
        keyPoints: [transcript],
        numbers: ["FY27 revenue $3.2 billion; 29% YoY growth"],
        positives: ["AI demand"],
        risks: ["Data center spending pressures margins"],
        themes: ["Infrastructure investment"],
        questions: ["What is the margin outlook?"],
      }),
    );
  }
  controls.analyses++;
  if (controls.failAnalysis-- > 0) return completion(null, "length");
  const raw = body.messages.at(-1).content;
  const prompt = JSON.parse(typeof raw === "string" ? raw : raw.find((c) => c.type === "text").text);
  const id = prompt.availableSources.find((s) => s.sourceType === "Call transcript").id;
  const p = (text) => ({ text, sourceIds: [id] });
  return completion(
    JSON.stringify({
      overview: p("Constructive revenue outlook with margin uncertainty."),
      keyPoints: [p("FY27 revenue is expected to reach $3.2 billion, up 29% year over year.")],
      numbers: [
        {
          metric: "Revenue",
          value: "$3.2 billion",
          period: "FY27",
          context: "Call expectation; not independently verified guidance.",
          sourceIds: [id],
        },
      ],
      positives: [p("AI demand supports growth.")],
      risks: [p("Data center spending may pressure margins.")],
      themes: [p("AI infrastructure investment")],
      catalysts: [],
      questions: [p("What is the margin impact of data center investment?")],
      crossChecks: [
        {
          claim: "FY27 revenue outlook",
          assessment: "Not covered",
          evidence: "Internal model reports $2.8 billion for FY26; the periods differ.",
          followUp: "Obtain a comparable FY27 estimate.",
          callSourceIds: [id],
          internalSourceIds: [internalSource.id],
        },
      ],
      coverage: "One internal model reviewed. Fiscal periods differ; this is not a contradiction.",
    }),
  );
}
