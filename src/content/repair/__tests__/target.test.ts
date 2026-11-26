// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { RepairApplyRequest } from "../../../shared/repair";
import type { ElementReference } from "../../../shared/types";
import { accessibleNameOf, buildPath } from "../../scanner/dom";
import { applyAccessibleName, captureLiveFor, resolveLocator, undoAccessibleName } from "../target";

const REF: ElementReference = { ref: "button", tagName: "button", locator: "body>button:nth-of-type(1)" };

function request(overrides: Partial<RepairApplyRequest> = {}): RepairApplyRequest {
  return {
    issueId: "button-name:body>button:nth-of-type(1)",
    documentId: "doc-test-00000001",
    locator: "body>button:nth-of-type(1)",
    expectedTag: "button",
    label: "Search",
    kind: "accessible-name",
    target: "aria-label",
    snapshot: [
      { name: "aria-label", present: false, value: null },
      { name: "aria-labelledby", present: false, value: null },
    ],
    proposedBy: "rule",
    explanation: "Deterministic icon rule.",
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("DOM repair primitives", () => {
  it("resolves a bounded structural locator", () => {
    document.body.innerHTML = '<main><button id="one">x</button><button id="two">y</button></main>';
    const element = resolveLocator(document, "body>main:nth-of-type(1)>button:nth-of-type(2)");
    expect(element?.id).toBe("two");
  });

  it("builds and resolves the indexed nth-child path", () => {
    document.body.innerHTML = '<main><button id="one">x</button><button id="two">y</button></main>';
    const element = document.getElementById("two") as HTMLElement;
    const locator = buildPath(element);
    expect(locator).toContain("nth-child(2)");
    expect(resolveLocator(document, locator)?.id).toBe("two");
  });

  it("resolves across an open shadow root", () => {
    document.body.innerHTML = "<div id='host'></div>";
    const host = document.getElementById("host") as HTMLElement & { attachShadow: (init: ShadowRootInit) => ShadowRoot };
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = "<button>hit</button>";
    const button = shadow.querySelector("button") as HTMLElement;
    const locator = buildPath(button);
    expect(resolveLocator(document, locator)).toBe(button);
  });

  it("applies a verified accessible name and records the exact previous state", () => {
    document.body.innerHTML = "<button><svg></svg></button>";
    const element = document.querySelector("button") as HTMLElement;
    const result = applyAccessibleName(element, request(), REF);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(element.getAttribute("aria-label")).toBe("Search");
    expect(accessibleNameOf(element)).toBe("Search");
    expect(result.repair?.previousPresent).toBe(false);
    expect(result.repair?.previousValue).toBe("");
    expect(result.repair?.accessibleNameBefore).toBe("");
  });

  it("refuses to overwrite an existing accessible name", () => {
    document.body.innerHTML = '<button aria-label="Existing">x</button>';
    const element = document.querySelector("button") as HTMLElement;
    const result = applyAccessibleName(element, request(), REF);
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(element.getAttribute("aria-label")).toBe("Existing");
  });

  it("undoes back to attribute absence", () => {
    document.body.innerHTML = "<button><svg></svg></button>";
    const element = document.querySelector("button") as HTMLElement;
    const result = applyAccessibleName(element, request(), REF);
    expect(result.repair).not.toBeNull();
    const undo = undoAccessibleName(element, {
      repairId: result.repair?.id ?? "",
      issueId: "issue",
      documentId: "doc-test-00000001",
      locator: "body>button:nth-of-type(1)",
      target: "aria-label",
      expectedCurrentValue: "Search",
      previousValue: null,
      previousPresent: false,
    });
    expect(undo.ok).toBe(true);
    expect(element.hasAttribute("aria-label")).toBe(false);
  });

  it("restores a previous attribute exactly when present", () => {
    document.body.innerHTML = '<button aria-label="Search">x</button>';
    const element = document.querySelector("button") as HTMLElement;
    const undo = undoAccessibleName(element, {
      repairId: "r1",
      issueId: "issue",
      documentId: "doc",
      locator: "body>button:nth-of-type(1)",
      target: "aria-label",
      expectedCurrentValue: "Search",
      previousValue: "Old",
      previousPresent: true,
    });
    expect(undo.ok).toBe(true);
    expect(element.getAttribute("aria-label")).toBe("Old");
  });

  it("does not undo when the site changed the attribute independently", () => {
    document.body.innerHTML = '<button aria-label="Site update">x</button>';
    const element = document.querySelector("button") as HTMLElement;
    const undo = undoAccessibleName(element, {
      repairId: "r1",
      issueId: "issue",
      documentId: "doc",
      locator: "body>button:nth-of-type(1)",
      target: "aria-label",
      expectedCurrentValue: "Search",
      previousValue: null,
      previousPresent: false,
    });
    expect(undo.ok).toBe(false);
    expect(undo.conflict).toBe(true);
    expect(element.getAttribute("aria-label")).toBe("Site update");
  });

  it("detects a replaced element", () => {
    document.body.innerHTML = "<button>x</button>";
    const before = document.querySelector("button") as HTMLElement;
    document.body.innerHTML = "<button>y</button>";
    const captured = captureLiveFor(document, request(), before);
    expect(captured.live.replaced).toBe(true);
  });
});
