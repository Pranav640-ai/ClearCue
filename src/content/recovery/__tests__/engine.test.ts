// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { RecoveryEvent } from "../../../shared/recovery";
import { RecoveryEngine } from "../engine";

let engine: RecoveryEngine | null = null;

afterEach(() => {
  engine?.stop();
  engine = null;
  document.body.innerHTML = "";
});

function start(html: string, now = 1_000): { events: RecoveryEvent[]; engine: RecoveryEngine } {
  document.body.innerHTML = html;
  const events: RecoveryEvent[] = [];
  engine = new RecoveryEngine({
    documentId: "document-12345678",
    pageUrl: "http://127.0.0.1:4318/recovery.html",
    onEvent: (event) => events.push(event),
    now: () => now,
    document,
  });
  engine.start();
  return { events, engine };
}

describe("recovery engine", () => {
  it("detects a newly displayed silent error without correlating synthetic events", () => {
    const { events, engine } = start(`
      <button id="submit">Continue</button>
      <div id="form-error" hidden><h2>There is a problem</h2><ul><li>Enter your name.</li><li>Enter your email.</li></ul></div>
    `);
    document.getElementById("submit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const box = document.getElementById("form-error") as HTMLElement;
    box.hidden = false;
    engine.flushNow();
    expect(events).toHaveLength(1);
    expect(events[0]?.category).toBe("error-summary");
    expect(events[0]?.interactionId).toBeNull();
    expect(events[0]?.announcementStatus).toBe("pending");
    expect(events[0]?.related).toBeNull();
  });

  it("associates an inline error explicitly and exposes a jump action", () => {
    const { events, engine } = start(`
      <div class="field-row">
        <label for="reg">Registration number</label>
        <input id="reg" aria-errormessage="reg-error">
        <p id="reg-error" class="field-error" hidden>Enter the eight-character registration number.</p>
      </div>
    `);
    (document.getElementById("reg") as HTMLInputElement).setAttribute("aria-invalid", "true");
    const error = document.getElementById("reg-error") as HTMLElement;
    error.hidden = false;
    engine.flushNow();
    expect(events.some((event) => event.message.includes("eight-character"))).toBe(true);
    const linked = events.find((event) => event.related?.locator.includes("input"));
    expect(linked?.related?.name).toBe("Registration number");
    expect(linked?.actions).toContain("jump");
  });

  it("suppresses an outcome the page already exposes through role=alert", () => {
    const { events, engine } = start(`
      <div id="summary" role="alert" aria-live="assertive" hidden>There is a problem. Enter your email.</div>
    `);
    (document.getElementById("summary") as HTMLElement).hidden = false;
    engine.flushNow();
    expect(events).toHaveLength(1);
    expect(events[0]?.existingAnnouncement).toBe("aria-live-assertive");
    expect(events[0]?.announcementStatus).toBe("announced-by-page");
  });

  it("does not announce the same unchanged outcome twice", () => {
    const { events, engine } = start(`
      <div id="summary" hidden>There is a problem. Enter your email.</div>
    `);
    const box = document.getElementById("summary") as HTMLElement;
    box.hidden = false;
    engine.flushNow();
    expect(events).toHaveLength(1);
    box.hidden = true;
    engine.flushNow();
    box.hidden = false;
    engine.flushNow();
    expect(events).toHaveLength(1);
  });

  it("reports loading completion without claiming success", () => {
    const { events, engine } = start('<div id="results" aria-busy="true">Saved yesterday.</div>');
    const results = document.getElementById("results") as HTMLElement;
    results.setAttribute("aria-busy", "false");
    engine.flushNow();
    expect(events).toHaveLength(1);
    expect(events[0]?.category).toBe("loading-completed");
    expect(events[0]?.message).toBe("Loading finished.");
    expect(events[0]?.severity).toBe("info");
  });

  it("detects an expanded menu and a newly opened dialog", () => {
    const { events, engine } = start(`
      <button id="menu" aria-expanded="false">Filters</button>
      <section id="filters" hidden>Price and size</section>
      <div id="dialog" role="dialog" aria-label="Delivery options" hidden><p>Choose a delivery date.</p></div>
    `);
    (document.getElementById("menu") as HTMLElement).setAttribute("aria-expanded", "true");
    (document.getElementById("dialog") as HTMLElement).hidden = false;
    engine.flushNow();
    expect(events.some((event) => event.category === "menu-expanded")).toBe(true);
    expect(events.some((event) => event.category === "dialog-opened")).toBe(true);
  });

  it("does not react to unrelated mutations or its own live regions", () => {
    const { events, engine } = start(`
      <p id="date">Monday</p>
      <div data-clearcue-owned="true" role="status">Saved.</div>
    `);
    const date = document.getElementById("date");
    if (date) date.textContent = "Tuesday";
    const own = document.querySelector("[data-clearcue-owned]");
    if (own) own.textContent = "Saved again.";
    engine.flushNow();
    expect(events).toHaveLength(0);
  });

  it("does not replay an error that was already on the page when observation began", () => {
    const { events, engine } = start('<div id="msg-error">There is a problem. Enter your email.</div><p id="clock">9:00</p>');
    const clock = document.getElementById("clock");
    if (clock) clock.textContent = "9:01";
    engine.flushNow();
    expect(events).toHaveLength(0);
  });
});
