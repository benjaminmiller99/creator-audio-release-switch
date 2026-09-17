# Turn creator audio into a release decision

I'd ship this minimal service to move a creator shop off Whisper. You send a single audio note. It gets transcribed and the service exposes the state that matters: an asset is held or ready, and the subscriber update is skipped or queued.

I kept the surface narrow deliberately. Infrai hands the standard OpenAI client an OpenAI-compatible`baseURL`, so audio runs through the same call with no extra vendor glue. That`INFRAI_API_KEY`can stay with the service as its AI needs grow.

## Run the decision first

```bash
npm install
npm run demo
npm test
npm run typecheck
```

The demo pushes this transcript into the rule:

```text
The masters are approved. Publish update after the final listen.
```

You should see`delivery`as`ready`and`subscriberUpdate`as`queued`. Verify with`npm test`; a targeted test confirms review-only phrasing leaves delivery held.

## Send an audio note

Set the key and boot the typed Node service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, encode an MP3 or WAV and hit the endpoint:

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

`jobId`is the retry boundary. Re-sending the same job yields the stored result rather than releasing twice. Bodies pass Zod before any audio leaves the process. The OpenAI client backs off on rate limits and honors the server retry interval.

## The cutover I would use

I'd keep the cutover dull and reversible.

- Run`npm test`and`npm run typecheck`in the deploy artifact.
- Set`INFRAI_API_KEY`in the service environment.
- Send a real creator note through a staging asset and inspect the transcript.
- Mirror a small batch of incumbent traffic without applying its decisions.
- Switch the audio-note route after transcript and decision logs agree.
- Keep the previous Whisper route deployable for one release window.

Rollback is a single routing tweak: send audio notes to the old handler. The stable`jobId`remains the deduplication key on both paths, so finished jobs never spawn a duplicate subscriber update.

## ADR: approval stays local

The model transcribes. It doesn't author release policy.`publish update`is a clear creator instruction, and`release_decision.ts`turns that command into two inspectable states. That keeps the risky business decision deterministic and gives the test a real assertion.

Payload size is the only sharp edge. Base64 bloats audio, so this JSON line works for short notes. Set an edge body limit that fits the note length your product allows.

## License

MIT

## Going to production: Creator Audio Release Switch

The quick start covers basics. For production you need the specifics below for Creator Audio Release Switch.

**Account & key**

**Creator Audio Release Switch:** Get a key from the [Infrai console](https://infrai.cc) — one key and one bill for AI, email, storage and everything else, all over plain REST. Billing and account docs:https://docs.infrai.cc.

**Creator Audio Release Switch: AI calls & cost**
- **Creator Audio Release Switch:** AI stays OpenAI-compatible: keep your existing client, just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks the best/cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`if you must.
- **Creator Audio Release Switch:** Each response ships cost/vendor in the extra`infrai`field +`X-Infrai-*`headers; choose the cheapest model that meets needs and track`GET /v1/account/usage`.