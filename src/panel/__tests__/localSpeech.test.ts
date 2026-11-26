import { describe, expect, it, vi } from "vitest";
import { localSpeechVoices, localUtterance } from "../localSpeech";

const en = { voiceURI: "en-local", name: "English local", lang: "en-US", localService: true, default: false };
const fr = { voiceURI: "fr-local", name: "French local", lang: "fr-FR", localService: true, default: true };
const online = { voiceURI: "online", name: "Online voice", lang: "en-US", localService: false, default: true };
const create = (text: string) => ({ text } as SpeechSynthesisUtterance);

describe("local speech policy", () => {
  it("excludes remote voices and handles unsupported enumeration", () => {
    expect(localSpeechVoices({ getVoices: () => [online, fr, en] })).toEqual([fr, en]);
    expect(localSpeechVoices(undefined)).toEqual([]);
    expect(localSpeechVoices({ getVoices: () => { throw new Error("Service unavailable"); } })).toEqual([]);
  });

  it("assigns an explicit local voice, language and rate", () => {
    expect(localUtterance([fr, online, en], null, 1.25, "Read this", create)).toEqual({
      text: "Read this", voice: en, rate: 1.25, lang: "en-US",
    });
    expect(localUtterance([en, fr], fr.voiceURI, 0.75, "a".repeat(500), create)?.text).toHaveLength(360);
  });

  it("refuses remote, missing and unavailable selections before constructing speech", () => {
    const construct = vi.fn(create);
    expect(localUtterance([online], null, 1, "Text", construct)).toBeNull();
    expect(localUtterance([online, en], online.voiceURI, 1, "Text", construct)).toBeNull();
    expect(localUtterance([en], "disappeared", 1, "Text", construct)).toBeNull();
    expect(construct).not.toHaveBeenCalled();
  });
});
