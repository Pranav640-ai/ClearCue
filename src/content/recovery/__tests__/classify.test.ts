// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  associateRecoveryTarget,
  classifyRecoveryMessage,
  detectAnnouncementMechanism,
  detectNativeValidation,
  isVisuallyHidden,
  looksLikeErrorSummary,
  messageLooksRelevant,
} from "../classify";
import type { DetectionContext } from "../classify";

const context: DetectionContext = {
  documentId: "document-12345678",
  pageUrl: "http://127.0.0.1:4318/recovery.html",
  interaction: null,
  now: 1_700_000_000_000,
  makeId: () => "event-fixed",
};

describe("outcome classification", () => {
  it("classifies error, success, failure and status text", () => {
    expect(classifyRecoveryMessage("Enter your full name.").category).toBe("validation-error");
    expect(classifyRecoveryMessage("Application submitted successfully.").category).toBe("success-confirmation");
    expect(classifyRecoveryMessage("Sorry, the payment failed. Try again.").category).toBe("operation-failure");
    expect(classifyRecoveryMessage("Changes saved.").category).toBe("success-confirmation");
    expect(classifyRecoveryMessage("Now showing 12 results.", { semantic: true }).category).toBe("status-update");
    expect(classifyRecoveryMessage("A quiet update.", { semantic: true }).category).toBe("status-update");
  });

  it("does not call every text change a recovery outcome", () => {
    expect(classifyRecoveryMessage("Tuesday, 3 March").category).toBe("uncertain-outcome");
    expect(classifyRecoveryMessage("There is a problem. Enter your name. Enter your email.", { errorSummary: true }).category).toBe("error-summary");
  });

  it("recognises error summaries with several linked messages", () => {
    document.body.innerHTML = '<div id="form-error"><h2>There is a problem</h2><ul><li>Enter your name.</li><li>Enter your email.</li></ul></div>';
    const summary = document.getElementById("form-error");
    expect(summary).not.toBeNull();
    if (!summary) return;
    expect(looksLikeErrorSummary(summary, summary.textContent ?? "")).toBe(true);
  });

  it("finds existing live semantics without inventing them", () => {
    document.body.innerHTML = '<div id="alert" role="alert">Saved.</div><div id="live" aria-live="polite">Ready</div><div id="plain">Saved.</div>';
    expect(detectAnnouncementMechanism(document.getElementById("alert") as Element)).toBe("role-alert");
    expect(detectAnnouncementMechanism(document.getElementById("live") as Element)).toBe("aria-live-polite");
    expect(detectAnnouncementMechanism(document.getElementById("plain") as Element)).toBe("none");
  });

  it("associates only explicit or single-group fields", () => {
    document.body.innerHTML = `
      <div class="field-row"><label for="reg">Registration number</label><input id="reg" aria-errormessage="reg-error"><p id="reg-error" class="field-error">Enter the number.</p></div>
      <div class="field-row"><label for="email">Email</label><input id="email" aria-describedby="shared-error"><label for="phone">Phone</label><input id="phone" aria-describedby="shared-error"><p id="shared-error">Check these fields.</p></div>
    `;
    const direct = associateRecoveryTarget(document, document.getElementById("reg-error") as Element, context.documentId);
    expect(direct.target?.tagName).toBe("input");
    expect(direct.target?.name).toBe("Registration number");
    expect(direct.confidence).toBe("direct");

    const ambiguous = associateRecoveryTarget(document, document.getElementById("shared-error") as Element, context.documentId, true);
    expect(ambiguous.target).toBeNull();
    expect(ambiguous.confidence).toBe("none");
  });

  it("never associates a summary with an invalid field in another form", () => {
    document.body.innerHTML = `
      <form id="first"><input id="elsewhere" aria-invalid="true"></form>
      <form id="second"><div id="summary"><p>Check the highlighted fields.</p></div><input id="account-email"></form>
    `;
    const result = associateRecoveryTarget(document, document.getElementById("summary") as Element, context.documentId, true);
    expect(result.target).toBeNull();
    expect(result.confidence).toBe("none");
  });

  it("distinguishes visually hidden from aria-hidden", () => {
    document.body.innerHTML = '<div id="toast" aria-hidden="true">Added to basket.</div><div id="gone" hidden>Hidden</div>';
    expect(isVisuallyHidden(document.getElementById("toast") as Element)).toBe(false);
    expect(isVisuallyHidden(document.getElementById("gone") as Element)).toBe(true);
  });

  it("does not treat a whole form as a message", () => {
    document.body.innerHTML = '<form id="errors"><input><p>Enter your name.</p></form>';
    const form = document.getElementById("errors") as Element;
    expect(messageLooksRelevant(form, form.textContent ?? "")).toBe(false);
  });

  it("reports native invalid fields without field values", () => {
    document.body.innerHTML = '<form><input id="name" required></form>';
    const input = document.getElementById("name") as HTMLInputElement;
    input.value = "private@example.com";
    input.setCustomValidity("Enter your name: private@example.com.");
    const event = detectNativeValidation(document, context, [input]);
    expect(event?.category).toBe("validation-error");
    expect(event?.related?.name).toBeTruthy();
    expect(event?.message).not.toContain(input.value);
  });
});
