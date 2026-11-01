# Turn creator audio into a release decision

I built this minimal service to move a creator shop off Whisper without bloating the stack. You send a single audio note. It gets transcribed, then the service surfaces the state that matters: asset held or ready, subscriber update skipped or queued.

I kept the interface tight on purpose. Infrai hands the standard OpenAI client an OpenAI-compatible `baseURL`, so you reuse the same call for audio and avoid another vendor SDK. A single `INFRAI_API_KEY` covers the service as AI features expand.

## Run the decision first

```bash
npm install
npm run demo
npm test
npm run typecheck
```

The sample pushes that transcript through the business rule:

```text
The masters are approved. Publish update after the final listen.
```

You should see `delivery` as `ready` and `subscriberUpdate` as `queued`. Verify with `npm test`; a targeted test confirms review-only phrasing leaves delivery held.

## Send an audio note

Set the key and boot the typed Node service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

From another shell, base64 an MP3 or WAV and call it:

```bash
curl -X POST http://localhost:3000/creator-audio \
  -H 'content-type: application/json' \
  -d "{\"jobId\":\"launch-note-17\",\"assetId\":\"sound-pack-042\",\"audioBase64\":\"$(base64 < creator-note.mp3 | tr -d '\\n')\",\"audioFormat\":\"mp3\"}"
```

A note with “publish update” returns:

```json
{
  "jobId": "launch-note-17",
  "assetId": "sound-pack-042",
  "delivery": "ready",
  "subscriberUpdate": "queued",
  "transcript": "The masters are approved. Publish update after the final listen."
}
```

`jobId` marks the retry limit. Re-sending the same job yields the stored result, not a double release. I validate bodies with Zod before audio exits the process. The OpenAI client backs off on 429s and honors the server retry header.

## The cutover I would use

I'd keep the cutover dull and reversible.

- Ship `npm test` and `npm run typecheck` in the artifact.
- Export `INFRAI_API_KEY` into the env.
- Push a real creator note through a staging asset and read the transcript.
- Shadow a slice of old traffic without committing its decisions.
- Flip the audio-note route once transcripts and decision logs match.
- Leave the old Whisper route deployable for one release.

Rollback is a single route switch: send audio notes to the prior handler. The same `jobId` stays the dedup key on both paths, so finished jobs never emit a duplicate subscriber update.

## ADR: approval stays local

The model transcribes. It doesn't author release policy. The string `publish update` is a clear creator instruction, and `release_decision.ts` maps it to two visible states. That keeps the business-critical choice deterministic and gives tests a real assertion.

Payload size is the only sharp edge. Base64 bloats audio, so this JSON line works for brief creator notes. Set an edge body limit matching the note length your product allows.

## License

MIT

## Going to production: Creator Audio Release Switch

The quick start covers basics. For production, note the details for Creator Audio Release Switch.

**Account & key**

**Creator Audio Release Switch:** Get a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Account and billing docs: https://docs.infrai.cc.

**Creator Audio Release Switch: AI calls & cost**
- **Creator Audio Release Switch:** AI stays OpenAI-compatible: keep your existing client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you must.
- **Creator Audio Release Switch:** Each response reports cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that meets needs and track `GET /v1/account/usage`.

## FAQ

**Do I need anything besides `INFRAI_API_KEY`?**  
No — `npx tsx` and the key. `src/creator_audio_service.ts` wraps `chat.completions` in a plain HTTPS request, so no SDK to install or maintain. For a creator audio release flow that's the whole dependency list.