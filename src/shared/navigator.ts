export interface NavigationControl {
  id: string;
  name: string;
  role: string;
  section: string;
  form: string;
  formKey?: string;
  choices?: string[];
}

export interface NavigationSnapshot {
  id: string;
  title: string;
  headings: string[];
  landmarks: string[];
  forms: number;
  controls: NavigationControl[];
  limited: boolean;
  sections?: { name: string; controls: string[] }[];
  fields?: NavigationField[];
}

export interface NavigationField {
  id: string;
  required: boolean;
  issue?: "missing" | "invalid";
}

export interface NavigationContext {
  text: string;
  snapshotId?: string;
  fields?: NavigationField[];
  focusedId?: string;
}

export interface NavigationMatch {
  control: NavigationControl;
  quality: "Exact" | "Likely" | "Possible";
  reason: string;
  score: number;
}

const aliases: Record<string, string> = {
  locate: "find", lookup: "search", look: "search", query: "search",
  orders: "order", purchases: "order", errors: "error", problem: "error",
  download: "download", export: "download", application: "apply", applying: "apply",
  registration: "registration", register: "registration", forms: "form", inputs: "input",
  textbox: "input", searchbox: "search input", combobox: "input",
};
const filler = new Set("i me my can could please find show where what how do on page this the a an in for to of want need enter type go".split(" "));

export function navigationWords(value: string): string[] {
  return Array.from(new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.flatMap((word) => {
    const normalized = Object.hasOwn(aliases, word) ? aliases[word] ?? word : word;
    return normalized.split(" ").filter((term) => !filler.has(term));
  }) ?? []));
}

export function rankNavigation(goal: string, controls: NavigationControl[]): NavigationMatch[] {
  const words = navigationWords(goal);
  if (!words.length) return [];
  return controls.flatMap((control): NavigationMatch[] => {
    const name = navigationWords(control.name);
    const role = navigationWords(control.role);
    const section = navigationWords(control.section);
    const form = navigationWords(control.form);
    const exact = name.length > 0 && words.every((word) => name.includes(word)) && name.every((word) => words.includes(word));
    let matched = 0;
    let score = 0;
    for (const word of words) {
      const weight = name.includes(word) ? 6 : role.includes(word) ? 4 :
        form.includes(word) ? 2 : section.includes(word) ? 1 : 0;
      if (weight) matched += 1;
      score += weight;
    }
    if (score === 0 || (words.length > 1 && matched === 1 && score <= 4)) return [];
    const quality = exact ? "Exact" : matched === words.length && score >= 4 ? "Likely" : "Possible";
    const reason = name.some((word) => words.includes(word)) ? "The control’s name matches your goal."
      : role.some((word) => words.includes(word)) ? "The control type matches your goal."
      : form.some((word) => words.includes(word)) ? "The control is in a related form."
      : "A nearby heading matches your goal.";
    return [{ control, quality, reason, score: score + (exact ? 20 : 0) }];
  }).sort((left, right) => right.score - left.score).slice(0, 8);
}
