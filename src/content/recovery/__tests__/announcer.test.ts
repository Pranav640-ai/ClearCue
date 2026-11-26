// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageAnnouncer } from "../announcer";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("page live regions", () => {
  it("creates accessible polite and assertive regions and writes once", () => {
    vi.useFakeTimers();
    const announcer = new PageAnnouncer(document);
    expect(announcer.announce({ message: "Changes saved.", category: "success-confirmation", severity: "success" })).toBe(true);
    vi.advanceTimersByTime(31);
    const { polite, assertive } = announcer.regions();
    expect(polite?.getAttribute("role")).toBe("status");
    expect(polite?.getAttribute("aria-live")).toBe("polite");
    expect(polite?.textContent).toBe("Changes saved.");
    expect(polite?.hasAttribute("aria-hidden")).toBe(false);
    expect(polite?.style.display).not.toBe("none");
    expect(assertive?.getAttribute("role")).toBe("alert");
    expect(assertive?.textContent).toBe("");
    announcer.dispose();
    expect(document.querySelectorAll("[data-clearcue-owned]")).toHaveLength(0);
  });

  it("writes both queued updates and reports actual DOM writes", () => {
    vi.useFakeTimers();
    const announcer = new PageAnnouncer(document);
    const writes: string[] = [];
    for (const message of ["First result.", "Second result."]) {
      expect(announcer.announce({ message, category: "success-confirmation", severity: "success" }, false, (written) => {
        if (written) writes.push(announcer.regions().polite?.textContent ?? "");
      })).toBe(true);
    }
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(180);
    expect(writes).toEqual(["First result.", "Second result."]);
    announcer.dispose();
  });

  it("uses assertive only for urgent failure and marks a replay", () => {
    vi.useFakeTimers();
    const announcer = new PageAnnouncer(document);
    announcer.announce({ message: "Payment failed. Try again.", category: "operation-failure", severity: "error" });
    vi.advanceTimersByTime(31);
    expect(announcer.regions().assertive?.textContent).toContain("Payment failed");
    announcer.announce({ message: "Payment failed. Try again.", category: "operation-failure", severity: "error" }, true);
    vi.advanceTimersByTime(31);
    expect(announcer.regions().assertive?.textContent).toContain("Repeated message.");
    announcer.dispose();
  });
});
