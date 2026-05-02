export const maxDuration = 60

// AI SDK v6 UIMessageChunk format. The wire format is SSE:
//   data: {"type":"text-delta","id":"...","delta":"..."}\n\n
function encode(part: object): string {
  return `data: ${JSON.stringify(part)}\n\n`
}

function startStream(messageId: string) {
  return encode({ type: "start", messageId })
}
function finishStream() {
  return encode({ type: "finish" })
}

function startStep() {
  return encode({ type: "start-step" })
}
function finishStep() {
  return encode({ type: "finish-step" })
}

function textStart(id: string) {
  return encode({ type: "text-start", id })
}
function textDelta(id: string, delta: string) {
  return encode({ type: "text-delta", id, delta })
}
function textEnd(id: string) {
  return encode({ type: "text-end", id })
}

function toolInputStart(toolCallId: string, toolName: string) {
  return encode({ type: "tool-input-start", toolCallId, toolName })
}
function toolInputAvailable(toolCallId: string, toolName: string, input: unknown) {
  return encode({ type: "tool-input-available", toolCallId, toolName, input })
}
function toolOutputAvailable(toolCallId: string, output: unknown) {
  return encode({ type: "tool-output-available", toolCallId, output })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let chunkSeq = 0
const newId = () => `c${Date.now().toString(36)}_${(chunkSeq++).toString(36)}`

async function* generateMockStream(lsoaCode: string): AsyncGenerator<string> {
  const messageId = newId()
  yield startStream(messageId)
  yield startStep()

  // Opening analysis text
  const introId = newId()
  yield textStart(introId)
  const intro = `Analysing LSOA **${lsoaCode}** — cross-referencing heat vulnerability indicators, land-use data, and infrastructure registers.\n\n`
  for (const char of intro) {
    yield textDelta(introId, char)
    await sleep(18)
  }
  yield textEnd(introId)

  // Tool call 1: fetch_land_use
  const tc1 = newId()
  yield toolInputStart(tc1, "fetch_land_use_data")
  yield toolInputAvailable(tc1, "fetch_land_use_data", { lsoa_code: lsoaCode })
  await sleep(400)
  yield toolOutputAvailable(tc1, {
    classification: "residential_terraced",
    impervious_pct: 93,
    tree_pit_count: 0,
    summary: `Fetched land-use classification for ${lsoaCode}: 68% residential terraced, 14% mixed commercial-retail, 11% surface car parking, 7% other impervious surfaces. No existing tree pits recorded within 200m buffer.`,
  })
  await sleep(200)

  const a1Id = newId()
  yield textStart(a1Id)
  const analysis1 =
    `Land-use data retrieved. The area shows **93% impervious surface coverage** — significantly above the borough median of 71%. No existing tree pit infrastructure in the immediate vicinity, indicating a greenfield opportunity for street tree planting.\n\nCross-referencing with EA urban heat surface temperature records (2022–2024)...\n\n`
  for (const char of analysis1) {
    yield textDelta(a1Id, char)
    await sleep(14)
  }
  yield textEnd(a1Id)

  // Tool call 2: query_funding_registry
  const tc2 = newId()
  yield toolInputStart(tc2, "query_funding_registry")
  yield toolInputAvailable(tc2, "query_funding_registry", {
    intervention_types: ["street_trees", "cool_roofs"],
    geography: lsoaCode,
  })
  await sleep(600)
  yield toolOutputAvailable(tc2, {
    schemes: [
      { name: "UKRI Urban Greening Fund", max_gbp: 250000, deadline: "2025-09-15" },
      { name: "NLHF Green Spaces for Health", max_gbp: 150000, deadline: "rolling" },
      { name: "GLA Urban Cooling Pilot Grant", max_gbp: 80000, deadline: "rolling" },
    ],
    summary: "Found 3 active funding schemes",
  })
  await sleep(200)

  const a2Id = newId()
  yield textStart(a2Id)
  const analysis2 =
    `Funding registry queried. Three active schemes are eligible for interventions in this area. The **UKRI Urban Greening Fund** offers the highest ceiling at £250k and aligns well with the proposed street tree programme. The **GLA Urban Cooling Pilot Grant** is London-specific and fast-tracked — suitable for smaller-scale cool pavements works.\n\n`
  for (const char of analysis2) {
    yield textDelta(a2Id, char)
    await sleep(14)
  }
  yield textEnd(a2Id)

  const synthId = newId()
  yield textStart(synthId)
  const synthesis = `## Synthesis\n\nBased on the vulnerability profile and land-use audit, two primary interventions are recommended for immediate planning consideration:\n\n1. **Street tree installation** — 8–12 semi-mature native specimens along the primary residential streetscape, targeting the identified car park and wide-pavement sections. Projected canopy cover increase: +4.1% within 5 years.\n\n2. **Cool roofs retrofit** — coordination with the existing housing stock management programme to apply high-albedo coating to flat-roof sections of the post-war residential blocks. Estimated 1.8–2.4°C surface temperature reduction in peak summer conditions.\n\nFull dossier follows.\n\n`
  for (const char of synthesis) {
    yield textDelta(synthId, char)
    await sleep(12)
  }
  yield textEnd(synthId)

  // Structured JSON dossier (rendered into final assistant text)
  const dossId = newId()
  yield textStart(dossId)
  const dossier = `\`\`\`json
{
  "lsoa_code": "${lsoaCode}",
  "summary": "High-priority urban heat intervention required. Area exhibits 93% impervious cover, near-zero canopy, and IMD decile 2 — compounding heat vulnerability for a predominantly elderly and socially rented population. Two targeted interventions identified with combined indicative cost of £187,500 and strong funding pathway via UKRI and GLA schemes.",
  "priority_level": "critical",
  "total_estimated_cost_gbp": 187500,
  "interventions": [
    {
      "type": "street_trees",
      "title": "Street Tree Installation Programme",
      "rationale_short": "Zero existing canopy cover on primary residential streets. 10 semi-mature native trees would deliver +4.1% local canopy cover within 5 years, reducing peak heat island effect by up to 3°C.",
      "estimated_cost_gbp": 85000,
      "target_locations": [
        { "lat": 51.4902, "lng": -0.0871 },
        { "lat": 51.4915, "lng": -0.0854 },
        { "lat": 51.4888, "lng": -0.0862 }
      ]
    },
    {
      "type": "cool_roofs",
      "title": "Cool Roof Albedo Retrofit",
      "rationale_short": "Post-war flat-roof residential blocks absorb significant solar radiation. High-albedo coating application would reduce roof surface temperatures by 15–20°C and lower internal cooling demand.",
      "estimated_cost_gbp": 102500,
      "target_locations": [
        { "lat": 51.4895, "lng": -0.0890 },
        { "lat": 51.4878, "lng": -0.0881 },
        { "lat": 51.4908, "lng": -0.0843 }
      ]
    }
  ]
}
\`\`\``

  for (const char of dossier) {
    yield textDelta(dossId, char)
    await sleep(8)
  }
  yield textEnd(dossId)

  yield finishStep()
  yield finishStream()
}

export async function POST(req: Request) {
  const body = await req.json()
  const lsoaCode: string =
    body?.messages?.[body.messages.length - 1]?.parts?.[0]?.text ??
    body?.lsoa_code ??
    "UNKNOWN"

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const chunk of generateMockStream(lsoaCode)) {
          controller.enqueue(encoder.encode(chunk))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Vercel-AI-Data-Stream": "v1",
    },
  })
}
