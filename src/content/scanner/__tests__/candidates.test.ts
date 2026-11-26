// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildCandidates, type CandidateInput } from "../candidates";

const base: CandidateInput = {
  element: null as unknown as Element,
  category: "button-name",
  role: "button",
  accessibleName: "",
  labelTexts: [],
  validRefIds: [],
  missingRefIds: [],
  duplicateRefIds: [],
  icon: null,
  destination: null,
  dangerous: false,
  conflicts: [],
};

function withElement(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild as Element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("deterministic repair candidates", () => {
  it("proposes the single associated label for an unnamed form control", () => {
    const element = withElement(`<input id="email" type="email">`);
    const candidates = buildCandidates({ ...base, element, category: "form-control-name", labelTexts: ["Email address"] });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "associated-label", support: "direct", confidence: "high" });
    expect(candidates[0]?.proposedValue).toBe("Email address");
  });

  it("proposes an accessible name from authored icon metadata", () => {
    const element = withElement(`<button><svg><title>Search</title></svg></button>`);
    const candidates = buildCandidates({
      ...base,
      element,
      category: "icon-control-name",
      icon: { hint: "Search", source: "svg-title", allowlisted: true },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "aria-label", proposedValue: "Search", confidence: "high" });
  });

  it("never guesses a label for a destructive action", () => {
    const element = withElement(`<a href="/account/logout"><svg><title>Account</title></svg></a>`);
    const candidates = buildCandidates({
      ...base,
      element,
      category: "link-name",
      icon: { hint: "Account", source: "svg-title", allowlisted: true },
      dangerous: true,
    });
    expect(candidates).toHaveLength(0);
  });

  it("does not guess when labels conflict", () => {
    const element = withElement(`<input id="x">`);
    const candidates = buildCandidates({
      ...base,
      element,
      category: "form-control-name",
      labelTexts: ["Email", "Phone"],
      conflicts: ["Several associated labels provide different text."],
    });
    expect(candidates).toHaveLength(0);
  });

  it("does not guess when a referenced id is duplicated", () => {
    const element = withElement(`<button aria-labelledby="dup"></button>`);
    const candidates = buildCandidates({
      ...base,
      element,
      duplicateRefIds: ["dup"],
      validRefIds: ["dup"],
    });
    expect(candidates).toHaveLength(0);
  });

  it("proposes a context label for a vague link only when the destination is meaningful", () => {
    const element = withElement(`<a href="/scholarships/engineering">click here</a>`);
    const candidates = buildCandidates({
      ...base,
      element,
      category: "vague-link",
      accessibleName: "click here",
      destination: { hostname: "example.org", path: "/scholarships/engineering", dangerous: false, slug: "engineering" },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "link-context", support: "heuristic" });
    expect(candidates[0]?.proposedValue).toBe("Open engineering");
  });

  it("proposes dropping only the missing references when some remain valid", () => {
    const element = withElement(`<button aria-labelledby="a missing"></button>`);
    const candidates = buildCandidates({
      ...base,
      element,
      validRefIds: ["a"],
      missingRefIds: ["missing"],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ kind: "repair-reference", proposedValue: "a" });
  });

  it("returns nothing when no evidence supports a label", () => {
    const element = withElement(`<button></button>`);
    expect(buildCandidates({ ...base, element })).toHaveLength(0);
  });
});
