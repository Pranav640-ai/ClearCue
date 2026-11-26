import { accessibleNameOf, isDisabledControl, roleOf } from "../scanner/dom";
import { resolveLocator } from "../repair/target";
import { isVisuallyHidden } from "./classify";

export interface FocusRecoveryResult {
  focused: boolean;
  reason: string;
  name: string;
}

export function isFocusable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (["input", "select", "textarea", "button", "summary"].includes(tag)) return true;
  if (tag === "a" && element.hasAttribute("href")) return true;
  if (element.hasAttribute("tabindex")) return Number(element.getAttribute("tabindex")) >= -1;
  return element.getAttribute("contenteditable") === "true";
}

/**
 * Jump only on explicit user request. It revalidates the live target first and
 * never modifies the target, its value or any page state.
 */
export function focusRecoveryTarget(doc: Document, locator: string): FocusRecoveryResult {
  const element = resolveLocator(doc, locator);
  if (!element) return { focused: false, reason: "The field is no longer on this page.", name: "" };
  return focusVerifiedElement(doc, element, accessibleNameOf(element).trim());
}

export function focusVerifiedElement(doc: Document, element: Element, name: string): FocusRecoveryResult {
  if (isVisuallyHidden(element)) return { focused: false, reason: "The field is hidden or no longer visible.", name };
  const check = (element as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof check === "function" && !check.call(element)) {
    return { focused: false, reason: "The field is not visible.", name };
  }
  if (isDisabledControl(element)) return { focused: false, reason: "The field is disabled.", name };
  if (!isFocusable(element)) return { focused: false, reason: "The target cannot receive keyboard focus without modifying the page.", name };

  try {
    element.scrollIntoView({ block: "center", inline: "nearest" });
  } catch {
    // Scrolling is best effort; focusing is still useful.
  }
  try {
    (element as HTMLElement).focus({ preventScroll: false });
  } catch {
    return { focused: false, reason: "The browser refused to focus the field.", name };
  }
  const root = element.getRootNode();
  const active = root instanceof ShadowRoot ? root.activeElement : doc.activeElement;
  if (active !== element) {
    return { focused: false, reason: "Focus did not move to the field; another element kept focus.", name };
  }
  return {
    focused: true,
    reason: `Focused the ${roleOf(element) || element.tagName.toLowerCase()}${name ? ` labelled ${name}` : ""}.`,
    name,
  };
}
