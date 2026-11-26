import { describe, expect, it } from "vitest";
import { finalVoiceDraft } from "../useLocalVoice";

const speech = (isFinal: boolean, confidence: number) =>
  Object.assign([{ transcript: "Open options menu", confidence }], { isFinal });

describe("local voice drafts", () => {
  it("ignores interim recognition even when confidence is high", () => {
    expect(finalVoiceDraft(speech(false, 0.99))).toEqual({ text: "", uncertain: false });
  });
  it("withholds uncertain finalized text and marks it for clarification", () => {
    expect(finalVoiceDraft(speech(true, 0.3))).toEqual({ text: "", uncertain: true });
  });
  it("returns a draft for user review when the final transcript is usable", () => {
    expect(finalVoiceDraft(speech(true, 0.9))).toEqual({ text: "Open options menu", uncertain: false });
  });
});
