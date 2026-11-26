// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeActions, type PracticeCapability } from "./actions";

const valid = { trustedSubmit: true, enabled: true };

function setup() {
  document.body.innerHTML = "<details><summary>Product help</summary><p>Help text</p></details>" +
    "<select><option>Relevance</option><option>Price from low to high</option></select>";
  const disclosure = document.querySelector("details")!;
  const summary = document.querySelector("summary")!;
  const select = document.querySelector("select")!;
  const render = vi.fn();
  const ordered = vi.fn(() => true);
  const resolve = vi.fn((snapshot: string, id: string) => {
    const element = id === "help" ? summary : id === "sort" ? select : null;
    return snapshot === "current" && element?.isConnected ? {
      element, control: { id, name: "", section: "", form: "", role: "" },
    } : { reason: "Stale target." };
  });
  const capabilities = new Map<Element, PracticeCapability>();
  capabilities.set(summary, { kind: "disclosure", target: summary, details: disclosure, name: "Product help" });
  capabilities.set(select, { kind: "sort", target: select,
    options: Array.from(select.options).map((element) => ({ element, label: element.label })), render, ordered });
  let now = 100;
  const clock = () => now;
  const engine = new PracticeActions(document, document.URL, { resolve }, capabilities, clock);
  return { engine, disclosure, summary, select, render, ordered, resolve,
    advance: () => { now += 15000; }, other: (url = document.URL) => new PracticeActions(document, url, { resolve }, capabilities, clock) };
}

describe("practice action policy", () => {
  beforeEach(() => vi.spyOn(document, "hidden", "get").mockReturnValue(false));

  it("accepts only an enabled trusted submit, and only in the designated document", () => {
    const { engine, other } = setup();
    expect(engine.authorize("current", "help", { kind: "open" }, { ...valid, enabled: false })).toBeNull();
    expect(engine.authorize("current", "help", { kind: "open" }, { ...valid, trustedSubmit: false })).toBeNull();
    expect(other("https://untrusted.test").authorize("current", "help", { kind: "open" }, valid)).toBeNull();
  });

  it("consumes a command once, and refuses cross-document, cancelled and expired commands", () => {
    const { engine, other, disclosure, advance } = setup();
    const command = engine.authorize("current", "help", { kind: "open" }, valid)!;
    expect(other().execute(command).status).toBe("blocked");
    expect(engine.execute(command).status).toBe("observed");
    expect(disclosure.open).toBe(true);
    expect(engine.execute(command).status).toBe("blocked");
    const cancelled = engine.authorize("current", "help", { kind: "close" }, valid)!;
    engine.cancel();
    expect(engine.execute(cancelled).status).toBe("blocked");
    const expired = engine.authorize("current", "help", { kind: "close" }, valid)!;
    advance();
    expect(engine.execute(expired).status).toBe("blocked");
    expect(disclosure.open).toBe(true);
  });

  it("rejects stale, substituted and regrouped disclosures", () => {
    const { engine, disclosure, summary } = setup();
    expect(engine.execute(engine.authorize("old", "help", { kind: "open" }, valid)!).status).toBe("blocked");
    disclosure.setAttribute("name", "group");
    expect(engine.execute(engine.authorize("current", "help", { kind: "open" }, valid)!).status).toBe("blocked");
    summary.replaceWith(summary.cloneNode(true));
    expect(engine.execute(engine.authorize("current", "help", { kind: "open" }, valid)!).status).toBe("blocked");
    expect(disclosure.open).toBe(false);
  });

  it("checks selected option identity and reports unverified order without claiming success", () => {
    const { engine, select, render, ordered } = setup();
    const action = { kind: "sort", option: 1 } as const;
    ordered.mockReturnValue(false);
    expect(engine.execute(engine.authorize("current", "sort", action, valid)!).status).toBe("uncertain");
    expect(select.selectedIndex).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
    select.options[1]?.replaceWith(select.options[1].cloneNode(true));
    select.selectedIndex = 1;
    expect(engine.execute(engine.authorize("current", "sort", { kind: "sort", option: 0 }, valid)!).status).toBe("blocked");
    expect(select.selectedIndex).toBe(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
