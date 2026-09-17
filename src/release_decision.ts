export type ReleaseAction = {
  assetId: string;
  delivery: "held" | "ready";
  subscriberUpdate: "skipped" | "queued";
  transcript: string;
};

const RELEASE_PHRASE = "publish update";

export function decideRelease(assetId: string, transcript: string): ReleaseAction {
  const approved = transcript.toLocaleLowerCase("en-US").includes(RELEASE_PHRASE);

  return {
    assetId,
    delivery: approved ? "ready" : "held",
    subscriberUpdate: approved ? "queued" : "skipped",
    transcript,
  };
}
