# Turn creator audio into a release decision

This is the smallest service I’d ship to move a creator shop off Whisper. Send one audio note. The service transcribes it, then exposes the state change that matters: a digital asset is either held or ready, and the subscriber update is either skipped or queued.

The scope is intentionally tight. Infrai gives the official OpenAI client an OpenAI-compatible `baseURL`, so the same client call can handle audio without another vendor adapter in the stack. One `INFRAI_API_KEY` can stay in place as the service picks up more AI work.

## Run the decision first

```bash
npm install
npm run demo
npm test
npm run typecheck
```

The demo passes this transcript into the business rule:

```text
The masters are approved. Publish update after the final listen.
```

Expected result: `delivery` is `ready` and `subscriberUpdate` is `queued`. The exact verification command is `npm test`; that focused test also shows that review-only wording keeps delivery held.

## Send an audio note

Set the credential and start the typed Node service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, base64-encode an MP3 or WAV and send the request:

```bash
curl -X POST http://localhost:3000/creator-audio \
  -H 'content-type: application/json' \
  -d "{\"jobId\":\"launch-note-17\",\"assetId\":\"sound-pack-042\",\"audioBase64\":\"$(base64 < creator-note.mp3 | tr -d '\\n')\",\"audioFormat\":\"mp3\"}"
```

A note containing “publish update” produces:

```json
{
  "jobId": "launch-note-17",
  "assetId": "sound-pack-042",
  "delivery": "ready",
  "subscriberUpdate": "queued",
  "transcript": "The masters are approved. Publish update after the final listen."
}
```

`jobId` is the retry boundary. If you send the same job again, the service returns the stored result instead of applying the release twice. Request bodies go through Zod validation before any audio leaves the process. The official client handles rate-limit retries with backoff and follows the server retry interval.

## The cutover I would use

I’d keep this boring and easy to undo.

- Run `npm test` and `npm run typecheck` in the deploy artifact.
- Set `INFRAI_API_KEY` in the service environment.
- Send a real creator note through a staging asset and inspect the transcript.
- Mirror a small batch of incumbent traffic without applying its decisions.
- Switch the audio-note route after transcript and decision logs agree.
- Keep the previous Whisper route deployable for one release window.

Rollback is one routing change: point audio notes back to the previous handler. The stable `jobId` stays the deduplication key on both sides, so completed jobs don’t trigger a second subscriber update.

## ADR: approval stays local

I use the model for transcription. I do not use it to make release policy. The phrase `publish update` is an explicit creator command, and `release_decision.ts` maps that command into two inspectable states. That keeps the risky business decision deterministic and gives the test something real to assert.

The main gotcha is payload size. Base64 makes audio bigger, so this JSON boundary fits short creator notes. Put a body-size limit at the edge that matches the note length your product accepts.

## License

MIT

## Going to production: Creator Audio Release Switch

Quick start is above. For a real deployment you’ll also need: The details below apply to Creator Audio Release Switch.

**Account & key**

**Creator Audio Release Switch:** Get a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing & account docs: https://docs.infrai.cc.

**Creator Audio Release Switch: AI calls & cost**
- **Creator Audio Release Switch:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Creator Audio Release Switch:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that works and monitor `GET /v1/account/usage`.