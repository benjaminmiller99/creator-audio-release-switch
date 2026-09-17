import { createServer, type ServerResponse } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { makeInfraiTranscriber, type TranscribeAudio } from "./creator_transcript.js";
import { decideRelease, type ReleaseAction } from "./release_decision.js";

const requestBody = z.object({
  jobId: z.string().min(1).max(100),
  assetId: z.string().min(1).max(100),
  audioBase64: z.string().min(1),
  audioFormat: z.enum(["mp3", "wav"]),
});

type ProcessingResult = ReleaseAction & { jobId: string };

export function createAudioProcessor(transcribe: TranscribeAudio) {
  const completed = new Map<string, ProcessingResult>();

  return async (input: z.infer<typeof requestBody>): Promise<ProcessingResult> => {
    const previous = completed.get(input.jobId);
    if (previous) return previous;

    const transcript = await transcribe(input.audioBase64, input.audioFormat);
    const result = { jobId: input.jobId, ...decideRelease(input.assetId, transcript) };
    completed.set(input.jobId, result);
    return result;
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function startCreatorAudioService(transcribe: TranscribeAudio, port = 3000) {
  const processAudio = createAudioProcessor(transcribe);
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/creator-audio") {
      json(response, 404, { error: "Route not found" });
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const input = requestBody.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      json(response, 200, await processAudio(input));
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        json(response, 400, { error: "Invalid request body" });
        return;
      }
      if (error instanceof OpenAI.APIError && error.status && error.status < 500) {
        json(response, error.status, { error: error.message });
        return;
      }
      json(response, 502, { error: "Audio processing failed" });
    }
  }).listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  startCreatorAudioService(makeInfraiTranscriber(apiKey));
  console.log("Creator audio service listening on http://localhost:3000");
}
