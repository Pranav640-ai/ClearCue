import { isUrgentRecovery, normalizeRecoveryText } from "../../shared/recovery";
import type { RecoveryEvent } from "../../shared/recovery";

/**
 * ClearCue-owned live regions. They are visually hidden with clipping, not
 * display:none or aria-hidden, so assistive technology receives their text.
 */
export class PageAnnouncer {
  private readonly doc: Document;
  private polite: HTMLElement | null = null;
  private assertive: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly queue: { region: HTMLElement; text: string; onWrite?: (written: boolean) => void }[] = [];

  constructor(doc: Document = document) {
    this.doc = doc;
  }

  prepare(): void {
    this.ensure(false);
  }

  announce(
    event: Pick<RecoveryEvent, "message" | "category" | "severity">,
    replay = false,
    onWrite?: (written: boolean) => void,
  ): boolean {
    const text = normalizeRecoveryText(event.message, 300);
    if (!text || this.queue.length >= 10) return false;
    const region = this.ensure(isUrgentRecovery(event));
    if (!region) return false;
    this.queue.push({ region, text: replay ? text + " Repeated message." : text, onWrite });
    this.flushNext();
    return true;
  }

  private flushNext(): void {
    const next = this.queue[0];
    if (!next || this.timer) return;
    next.region.replaceChildren();
    this.timer = setTimeout(() => {
      this.queue.shift();
      const written = next.region.isConnected;
      if (written) next.region.textContent = next.text;
      // Keep the last write exposed before clearing a region for the next one.
      if (this.queue.length > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flushNext();
        }, 120);
      } else {
        this.timer = null;
      }
      next.onWrite?.(written);
    }, 30);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const item of this.queue.splice(0)) item.onWrite?.(false);
    this.polite?.remove();
    this.assertive?.remove();
    this.polite = null;
    this.assertive = null;
  }

  regions(): { polite: HTMLElement | null; assertive: HTMLElement | null } {
    return { polite: this.polite, assertive: this.assertive };
  }

  private ensure(urgent: boolean): HTMLElement | null {
    const body = this.doc.body;
    if (!body) return null;
    if (!this.polite?.isConnected) {
      this.polite = this.create("polite", "status");
      body.appendChild(this.polite);
    }
    if (!this.assertive?.isConnected) {
      this.assertive = this.create("assertive", "alert");
      body.appendChild(this.assertive);
    }
    return urgent ? this.assertive : this.polite;
  }

  private create(politeness: "polite" | "assertive", role: "status" | "alert"): HTMLElement {
    const region = this.doc.createElement("div");
    region.setAttribute("data-clearcue-owned", "true");
    region.setAttribute("data-clearcue-live", politeness);
    region.setAttribute("role", role);
    region.setAttribute("aria-live", politeness);
    region.setAttribute("aria-atomic", "true");
    region.setAttribute("aria-relevant", "additions text");
    region.style.cssText =
      "position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;border:0!important;";
    return region;
  }
}
