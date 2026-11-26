import { PageAnnouncer } from "./announcer";
import { detectNativeValidation } from "./classify";
import { RecoveryEngine } from "./engine";
import { focusRecoveryTarget } from "./focus";
import { InteractionTracker } from "./interactions";
import { buildPath } from "../scanner/dom";

declare global {
  interface Window {
    ClearCueRecovery?: {
      Engine: typeof RecoveryEngine;
      Announcer: typeof PageAnnouncer;
      Tracker: typeof InteractionTracker;
      focus: typeof focusRecoveryTarget;
      nativeValidation: typeof detectNativeValidation;
      buildPath: typeof buildPath;
    };
  }
}

/** Test-only bundle; never packaged into the extension. */
window.ClearCueRecovery = {
  Engine: RecoveryEngine,
  Announcer: PageAnnouncer,
  Tracker: InteractionTracker,
  focus: focusRecoveryTarget,
  nativeValidation: detectNativeValidation,
  buildPath,
};

export {};
