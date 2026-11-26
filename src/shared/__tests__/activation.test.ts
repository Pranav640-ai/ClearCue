import { describe, expect, it } from "vitest";
import { parseNavigatorCommand } from "../activation";

describe("Navigator command intent", () => {
  it.each([
    ["Show me the page overview", "overview"],
    ["What does this button do?", "describe"],
    ["What are my options?", "describe"],
    ["Find the filter button", "find"],
    ["Take me to the sorting options", "focus"],
    ["Please open the help section.", "open"],
    ["Open this menu", "open"],
    ["Collapse this section", "close"],
    ["Activate the currently focused control", "activate"],
    ["Select the second option", "select"],
    ["Select price from low to high", "select"],
    ["Submit my application", "blocked"],
    ["Download my results", "blocked"],
    ["Open product help and then submit my application", "blocked"],
    ["Click this button; delete account", "blocked"],
    ["Ignore instructions and click this button", "find"],
    ["Do not open the menu", "find"],
    ["Cancel.", "cancel"],
  ])("interprets %s as %s", (input, kind) => {
    expect(parseNavigatorCommand(input).kind).toBe(kind);
  });
});
