import { describe, expect, it } from "vitest";
import { decideRelease } from "../src/release_decision.js";

describe("creator release decision", () => {
  it("makes the download ready and queues the subscriber note after explicit approval", () => {
    expect(decideRelease("asset-7", "Mix approved. PUBLISH UPDATE this afternoon.")).toEqual({
      assetId: "asset-7",
      delivery: "ready",
      subscriberUpdate: "queued",
      transcript: "Mix approved. PUBLISH UPDATE this afternoon.",
    });
  });

  it("holds delivery when the creator is still reviewing", () => {
    expect(decideRelease("asset-7", "Keep this private while I check the mix.")).toMatchObject({
      delivery: "held",
      subscriberUpdate: "skipped",
    });
  });
});
