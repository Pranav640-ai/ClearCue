// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PageNavigator } from "../navigator";
import { rankNavigation } from "../../shared/navigator";

describe("local navigator", () => {
  it("ranks scoped controls, preserves an input value and focuses only on request", () => {
    document.body.innerHTML = `<h1>Registry</h1><nav><a href="#portal">My orders</a></nav>
      <section><h2>Member application</h2><form aria-label="Application form">
      <label for="reference">Registration number</label><input id="reference" value="PRIVATE">
      <input type="password" aria-label="Password" value="PRIVATE"><button disabled>Submit registration</button></form></section>`;
    const navigator = new PageNavigator(document);
    const overview = navigator.read();
    expect(overview.headings).toContain("Member application");
    expect(overview.controls.map((control) => control.name)).toEqual(["My orders", "Registration number"]);
    expect(JSON.stringify(overview)).not.toContain("PRIVATE");
    expect(rankNavigation("find submarine insurance", overview.controls)).toEqual([]);
    expect(rankNavigation("Find my orders", overview.controls)[0]?.quality).toBe("Exact");
    const match = rankNavigation("Where can I enter my registration number?", overview.controls)[0]!;
    expect(match.control.name).toBe("Registration number");
    expect(document.activeElement).not.toBe(document.querySelector("#reference"));
    expect(navigator.focus(overview.id, match.control.id).focused).toBe(true);
    expect(document.activeElement).toBe(document.querySelector("#reference"));
    expect(document.querySelector<HTMLInputElement>("#reference")?.value).toBe("PRIVATE");
  });

  it("rejects a substituted element, unknown ID, retargeted link and superseded snapshot", () => {
    document.body.innerHTML = '<a href="#download">Download receipt</a><button type="button">More details</button>';
    const navigator = new PageNavigator(document);
    const old = navigator.read();
    const overview = navigator.read();
    expect(navigator.focus(old.id, "1").focused).toBe(false);
    expect(navigator.focus(overview.id, "999").focused).toBe(false);
    document.querySelector("a")?.setAttribute("href", "#archive");
    const button = document.querySelector("button")!;
    button.replaceWith(button.cloneNode(true));
    expect(navigator.focus(overview.id, "1").focused).toBe(false);
    expect(navigator.focus(overview.id, "2").focused).toBe(false);
  });

  it("lists bounded, enabled option labels while omitting native values and form choices", () => {
    document.body.innerHTML = `<select aria-label="Sort">
      <option value="PRIVATE">Featured</option><option disabled>Disabled choice</option>
      <option hidden>Hidden choice</option><optgroup disabled label="Group"><option>Group choice</option></optgroup>
      ${Array.from({ length: 15 }, (_, index) => `<option>Choice ${index}</option>`).join("")}</select>
      <form><select aria-label="Account"><option value="PRIVATE">Private account</option></select></form>`;
    const controls = new PageNavigator(document).read().controls;
    const sort = controls.find((control) => control.name === "Sort");
    expect(sort?.choices).toEqual(["Featured", ...Array.from({ length: 8 }, (_, index) => `Choice ${index}`)]);
    expect(controls.find((control) => control.name === "Account")?.choices).toBeUndefined();
    expect(JSON.stringify(controls)).not.toContain("PRIVATE");
  });

  it("reads live validity without disclosing values or moving focus", () => {
    document.body.innerHTML = `<h2>Membership</h2><form><label for="email">Contact email</label>
      <input id="email" type="email" required><input type="password" required aria-label="Hidden secret"></form>`;
    const navigator = new PageNavigator(document);
    const snapshot = navigator.read();
    const field = document.querySelector<HTMLInputElement>("#email")!;
    expect(snapshot.sections).toEqual([{ name: "Membership", controls: ["1"] }]);
    expect(snapshot.fields).toEqual([{ id: "1", required: true, issue: "missing" }]);
    field.value = "PRIVATE-FICTIONAL";
    field.focus();
    const context = navigator.context();
    expect(context.focusedId).toBe("1");
    expect(context.text).toContain("Section: Membership");
    expect(context.fields).toEqual([{ id: "1", required: true, issue: "invalid" }]);
    expect(JSON.stringify(context)).not.toContain(field.value);
    expect(document.activeElement).toBe(field);
    field.value = "fictional@example.test";
    expect(navigator.context().fields).toEqual([{ id: "1", required: true, issue: undefined }]);
  });
});
