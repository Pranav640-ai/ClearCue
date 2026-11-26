// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { buildPath } from "../../scanner/dom";
import { focusRecoveryTarget } from "../focus";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("jump to affected field", () => {
  it("focuses the live target only when asked and leaves its value intact", () => {
    document.body.innerHTML = '<label for="reg">Registration number</label><input id="reg" value="NF-12345">';
    const input = document.getElementById("reg") as HTMLInputElement;
    const result = focusRecoveryTarget(document, buildPath(input));
    expect(result.focused).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("NF-12345");
  });

  it("refuses a stale target", () => {
    document.body.innerHTML = '<input id="reg">';
    const locator = buildPath(document.getElementById("reg") as Element);
    document.body.innerHTML = "";
    expect(focusRecoveryTarget(document, locator).focused).toBe(false);
  });

  it("refuses a hidden, disabled or non-focusable target", () => {
    document.body.innerHTML = `
      <div id="hidden" hidden>Hidden</div>
      <input id="disabled" disabled>
      <span id="plain">Plain text</span>
    `;
    expect(focusRecoveryTarget(document, buildPath(document.getElementById("hidden") as Element)).focused).toBe(false);
    expect(focusRecoveryTarget(document, buildPath(document.getElementById("disabled") as Element)).focused).toBe(false);
    expect(focusRecoveryTarget(document, buildPath(document.getElementById("plain") as Element)).focused).toBe(false);
  });
});
