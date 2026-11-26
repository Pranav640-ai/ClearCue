import { rankNavigation, type NavigationSnapshot } from "./navigator";

export function guidanceCommand(text: string): "next" | "take" | "back" | "where" | "continue" | undefined {
  const command = text.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/’/g, "'");
  switch (command) {
    case "what's next":
    case "what is next": return "next";
    case "take me there": return "take";
    case "go back": return "back";
    case "where am i": return "where";
    case "continue my task": return "continue";
    default: return undefined;
  }
}

export function guideStep(goal: string, page: NavigationSnapshot, current: string) {
  const matches = rankNavigation(goal, page.controls);
  if (!matches.length) return { matches, candidate: undefined, message: "This page has no grounded next control for that goal." };
  const [first, second] = matches;
  const grounded = first && first.quality !== "Possible" && first.score !== second?.score ? first.control : undefined;
  const active = page.controls.find((control) => control.id === current);
  const related = active && (matches.some(({ control }) => control.id === active.id) ||
    (grounded?.formKey && active.formKey === grounded.formKey)) ? active : undefined;
  if (related?.formKey && !page.fields?.some((field) => field.id === related.id && field.issue)) {
    const next = page.controls.find((control) => control.id !== current && control.name &&
      control.formKey === related.formKey && page.fields?.some((field) => field.id === control.id && field.issue));
    if (next) {
      return { matches, candidate: next.id,
        message: `Suggested next step: ${next.name}. This field in the same form needs attention.` };
    }
  }
  const control = related ?? grounded;
  if (!control) return { matches, candidate: undefined, message: "Review the matching controls and choose one before continuing." };
  const name = control.name || `unnamed ${control.role}`;
  const field = page.fields?.find((entry) => entry.id === control.id);
  const instructions = field?.issue === "missing" ? "The required field is incomplete. Enter the requested information on the page."
    : field?.issue === "invalid" ? "The field needs validation review. Check the page's instructions or Interaction Recovery."
    : field ? "Review the field and its requirements on the page. Completion has not been confirmed."
    : "Review or operate this control yourself when ready.";
  return {
    matches, candidate: related ? undefined : control.id,
    message: `${related ? "Current step" : "Suggested next step"}: ${name}. ${instructions}`,
  };
}
