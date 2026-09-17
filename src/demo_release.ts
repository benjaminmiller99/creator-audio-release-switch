import { decideRelease } from "./release_decision.js";

const result = decideRelease(
  "sound-pack-042",
  "The masters are approved. Publish update after the final listen.",
);

console.log(JSON.stringify(result, null, 2));
