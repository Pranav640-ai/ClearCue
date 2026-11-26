export function localSpeechVoices(synthesis: Pick<SpeechSynthesis, "getVoices"> | undefined): SpeechSynthesisVoice[] {
  try {
    return (synthesis?.getVoices() ?? []).filter((voice) =>
      voice.localService === true && voice.voiceURI.length > 0 && voice.voiceURI.length <= 250);
  } catch {
    return [];
  }
}

export function localUtterance(
  voices: readonly SpeechSynthesisVoice[],
  voiceURI: string | null,
  rate: number,
  text: string,
  create: (text: string) => SpeechSynthesisUtterance,
): SpeechSynthesisUtterance | null {
  const local = voices.filter((voice) => voice.localService === true && voice.voiceURI.length > 0);
  const voice = voiceURI ? local.find((item) => item.voiceURI === voiceURI)
    : local.find((item) => /^en(?:-|$)/i.test(item.lang) && item.default)
      ?? local.find((item) => /^en(?:-|$)/i.test(item.lang)) ?? local[0];
  const bounded = text.trim().slice(0, 360);
  if (!voice || !bounded) return null;
  const utterance = create(bounded);
  utterance.voice = voice;
  if (utterance.voice !== voice) return null;
  utterance.lang = voice.lang;
  utterance.rate = rate;
  return utterance;
}
