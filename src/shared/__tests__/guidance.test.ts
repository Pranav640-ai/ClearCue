import { expect, it } from "vitest";
import { guidanceCommand, guideStep } from "../guidance";
import type { NavigationSnapshot } from "../navigator";

const page: NavigationSnapshot = {
  id: "snapshot", title: "Portal", headings: [], landmarks: [], forms: 2, limited: false,
  controls: [
    { id: "1", name: "Registration number", role: "textbox", section: "Membership", form: "form", formKey: "1" },
    { id: "2", name: "Email", role: "textbox", section: "Other", form: "form", formKey: "2" },
    { id: "3", name: "Contact email", role: "textbox", section: "Membership", form: "form", formKey: "1" },
  ],
  fields: [{ id: "1", required: true }, { id: "2", required: true, issue: "missing" }, { id: "3", required: true, issue: "missing" }],
};

it("recognizes only explicit guidance phrases", () => {
  expect(["What’s next?", "Take me there", "Go back", "Where am I?", "Continue my task"].map(guidanceCommand))
    .toEqual(["next", "take", "back", "where", "continue"]);
  expect(guidanceCommand("Take me there and submit")).toBeUndefined();
});

it("guides within the same actual form and leaves completion unverified", () => {
  expect(guideStep("Registration number", page, "").candidate).toBe("1");
  expect(guideStep("Registration number", page, "1").candidate).toBe("3");
  expect(guideStep("Registration number", page, "3").message).toContain("incomplete");
  expect(guideStep("Registration number", { ...page, fields: [{ id: "1", required: true }] }, "1").message)
    .toContain("Completion has not been confirmed");
});

it("does not choose a tied or weak suggestion", () => {
  const duplicate = { ...page, controls: [...page.controls, { ...page.controls[0]!, id: "4" }] };
  expect(guideStep("Registration number", duplicate, "").candidate).toBeUndefined();
  expect(guideStep("unrelated goal", page, "").candidate).toBeUndefined();
});
