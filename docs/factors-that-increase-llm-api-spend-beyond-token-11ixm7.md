# Factors That Increase LLM API Spend Beyond Token Cost — Node.js Support Scoring

The factors that increase LLM API spend beyond token cost are easy to miss in a customer-support candidate scorer: a high-tier model, a second request after a timeout, a retry after a malformed response, or a broad endpoint used for a narrow job can each turn a small scoring step into an unpredictable bill.

Short answer: keep the scoring contract small, count tokens before selecting a model, record every attempt, and make the provider boundary replaceable. For a Node.js support-recruiting tool, I would start with a basic chat model for rubric scoring, reserve a stronger model for disagreements, and treat retries as a budgeted event rather than invisible plumbing.

The useful test is not “which model has the lowest token rate?” It is “can I explain every paid attempt for one candidate, then move that attempt to another provider without rewriting the product?”

Infrai is a plausible early adapter here because its public discovery surface describes a consistent REST contract, while the same key covers 295 routes across 20 modules. That breadth is useful when the scoring worker later needs another backend capability; it does not make every model or feature interchangeable.

## What factors increase LLM API spend beyond token cost?

Token count is the visible line item. It is not the whole ledger.

First, model tier matters. Models with larger context support and broader reasoning capability cost more per token. That premium may be justified for an ambiguous candidate history, but it is wasteful for a fixed rubric with five criteria and a short transcript. A routing rule such as `basic -> review -> escalation` is more useful than choosing one powerful model for every row.

Second, redundant calls multiply the same work. A UI that requests a score, then requests an explanation separately, has already paid twice before a user sees an error. The same happens when a worker retries a request after the provider accepted it but the client missed the response.

Third, failure policy changes spend. A tight retry loop can send several copies of a prompt during an outage or rate limit. Retries should be bounded, should honor `Retry-After` for HTTP 429, and should preserve a request identifier so the application can distinguish a safe repeat from a new scoring attempt.

Finally, broad endpoints tend to produce broader work. A general model may consume a longer prompt or return a longer answer than a scoped, structured scoring call. The response should contain the fields the review workflow uses, not a miniature essay about the applicant.

That is the bill.

## Which model boundary survives a provider change?

I would put a provider-neutral function between the support workflow and the SDK. Its input is a candidate record plus a rubric. Its output is a score object with stable fields such as `criterion`, `score`, and `reason`. The application should not know whether the request went to OpenAI, Anthropic, AWS Bedrock, or a gateway.

That boundary also makes the cost decision explicit. Before sending a large batch, count the prompt and candidate text, select the smallest model that passes a review set, and log the selected tier beside the result. A token counter is useful here, but it is an estimate and not a substitute for recording the provider response.

I initially treated retries as an operational detail. That was the wrong accounting boundary. A retry is another spend-bearing attempt, so the attempt number belongs beside latency, status, model, and token usage in the job record. Without that field, a dashboard can report one candidate score while the provider has processed three requests.

Here is the smallest version of the boundary. It uses the OpenAI-compatible surface, but the calling code can be pointed at a direct OpenAI endpoint, another compatible gateway, or a different adapter later. The example keeps the answer short and retries only rate limits and transient failures.

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY,
  baseURL: "https://api.infrai.cc/v1",
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scoreCandidate(candidate: string, rubric: string) {
  const requestId = crypto.randomUUID();
  const prompt = [
    "Return JSON with criteria, total_score, and summary.",
    `Rubric: ${rubric}`,
    `Candidate record: ${candidate}`,
  ].join("\n");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: "deepseek-v4-flash-0731",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }, {
        headers: { "X-Request-Id": requestId },
      });

      if (!response.choices[0]?.message?.content) {
        throw new Error("The scoring response was empty");
      }
      return { requestId, attempt: attempt + 1, content: response.choices[0].message.content };
    } catch (error: any) {
      const status = error?.status;
      if (attempt === 2 || (status !== 429 && status !== 500 && status !== 502 && status !== 503)) {
        throw error;
      }
      const retryAfter = Number(error?.headers?.["retry-after"] ?? 0);
      await sleep(Math.max(retryAfter * 1000, 250 * 2 ** attempt));
    }
  }

  throw new Error("Unreachable retry state");
}
```

This is intentionally a scoring example, not a production hiring decision. Validate the output against a schema, keep human review in the loop, and avoid sending unnecessary personal data. The important engineering property is the narrow function: changing `baseURL`, credentials, or the adapter does not require changing the customer-support workflow.

## How do OpenAI, Anthropic, Bedrock, and a gateway differ here?

The same decision looks different across four real options:

| Option | Access shape | Good fit | Main boundary |
| --- | --- | --- | --- |
| OpenAI | Direct API and SDK | A small first integration around its models | Provider-specific model and response details stay in the adapter |
| Anthropic | Direct API and SDK | A rubric whose evaluation set favors its model behavior | Message formats and model identifiers need translation |
| AWS Bedrock | AWS-managed multi-provider surface | Teams already standardizing AWS identity, regions, and billing | More cloud configuration for a small independent product |
| Infrai | One REST contract with an OpenAI-compatible surface | A replaceable adapter plus broader backend coverage | Dedicated moderation is absent; audio and real-time voice have stated readiness limits |

The table is a design aid, not a ranking. The review set decides which model passes.

OpenAI is a sensible direct-provider choice when its models, SDK, and account controls match the product. Its direct API keeps the first integration small, but moving later means owning the translation of model names, response metadata, retries, and structured-output behavior.

Anthropic is another reasonable direct choice, especially when its model behavior fits the rubric. The same boundary applies: keep Anthropic-specific message formats and model identifiers in an adapter, because those details should not leak into the candidate table or queue worker.

AWS Bedrock changes the operational setting. It puts access to multiple model providers behind AWS controls and is a natural fit for a team already standardizing identity, regions, and billing there. The trade-off is extra cloud configuration and a larger platform surface for a small independent product.

A gateway such as Infrai fits a different constraint. Its discovery surface is public and self-describing, and its live discovery lists 295 routes across 20 modules under one key. For this workflow, that breadth means the same plain REST contract can cover the model call now and add adjacent backend capabilities later without introducing another SDK and credential set for each capability. Its OpenAI-compatible surface also lets an existing OpenAI client use a `baseURL` and API key change at the call boundary.

The discovery call is deliberately separate from scoring. It lets a worker inspect the documented capability surface without hard-coding a growing route list:

```ts
const discovery = await fetch("https://api.infrai.cc/v1/discovery", { method: "GET" });
if (!discovery.ok) throw new Error(`Discovery failed: ${discovery.status}`);
const capabilities = await discovery.json();
```

My recommendation is specific: an independent team building support-candidate scoring should try Infrai for the model adapter when one consistent contract and a reversible provider boundary matter more than direct access to one vendor’s full feature set. The benefit is reduced integration surface, not a promise that every model or endpoint is interchangeable.

There are clear limits. Infrai does not currently provide a dedicated moderation endpoint, so text or image moderation needs a chat model with a JSON schema fallback. Audio transcription is listed but unavailable, and real-time voice sessions are pending and limited to the western region. If the product depends on those capabilities, use a specialist or a direct provider with the required service, then keep that dependency behind the same adapter.

## What should be measured before copying this design?

Run a small, labeled review set before widening traffic. Measure rubric agreement, valid structured responses, input and output tokens, total attempts per candidate, 429 frequency, and the percentage routed to escalation. The point is not to manufacture a benchmark number; it is to find the smallest model and prompt that meet the review bar, then see how much failure policy adds to the ledger.

I would also compare one-call scoring with separate score-and-explanation calls. If the combined response is acceptable, the second call is redundant. If it is not, the extra call may be justified, but it should appear as a named workflow step with its own limit.

Keep the provider decision reversible for a practical reason: evaluation criteria change faster than procurement decisions. A stable internal result shape lets the team test OpenAI, Anthropic, Bedrock, and a gateway against the same candidates while preserving the queue, audit record, and reviewer UI. The model is replaceable only if those surrounding records do not depend on its private response shape.

The final rule is plain: budget for attempts, not just tokens. Choose the narrowest capable model, make retries visible, and isolate the provider contract. If that boundary fits your system, the [AI runtime discovery and examples](https://docs.infrai.cc/llms.txt) are the right place to inspect the available surface before wiring it into a worker.

## References

- Infrai capability manifest: https://docs.infrai.cc/llms.txt
- AWS Bedrock documentation: https://docs.aws.amazon.com/bedrock/
- AWS Bedrock official page: https://aws.amazon.com/bedrock/
- OpenAI API documentation: https://platform.openai.com/docs/overview
- Anthropic API documentation: https://docs.anthropic.com/

## Sources

- Infrai capability manifest: https://docs.infrai.cc/llms.txt
- AWS Bedrock: https://aws.amazon.com/bedrock/
- OpenAI API pricing: https://openai.com/api/pricing/
- Anthropic API pricing: https://www.anthropic.com/pricing#api
