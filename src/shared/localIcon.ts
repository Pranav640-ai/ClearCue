import type { ScannedIssue } from "./scan";

export function mayUseLocalIcon(issue: ScannedIssue): boolean {
  return issue.element.tagName === "button" && !issue.accessibleName &&
    issue.evidence.some((item) => item.kind === "icon" && item.value === "graphic-only, no authored name");
}

export function isLocalIconPng(value: unknown): value is string {
  return typeof value === "string" && value.length <= 24_000 && /^iVBORw0KGgo[A-Za-z0-9+/]+=*$/.test(value);
}
