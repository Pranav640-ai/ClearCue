import { useRef, useState } from "react";
import { Section } from "./Section";

export function Introduction({ seen, onComplete }: { seen: boolean; onComplete: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(!seen);
  const toggle = useRef<HTMLButtonElement>(null);
  const dismiss = () => {
    setOpen(false);
    onComplete();
    toggle.current?.focus();
  };

  return <Section id="introduction" title="Get started with ClearCue">
    <button ref={toggle} type="button" className="button" aria-expanded={open} aria-controls="introduction-steps"
      onClick={() => open ? dismiss() : setOpen(true)}>
      {open ? "Hide introduction" : "Revisit introduction"}
    </button>
    <div id="introduction-steps" hidden={!open}>
      <ol>
        <li><strong>Enable a site when you need help.</strong> Open ClearCue from its toolbar icon, then grant access to that site. You can revoke it in Site access. Scanning, Rules, typed navigation and recovery work offline.</li>
        <li><strong>Find and inspect controls.</strong> Type a goal in Context Navigator. “What’s next?” previews a step and “Take me there” moves focus on request. Alt+Shift+C opens ClearCue. Alt+Shift+L explains the focused control. Find and change assignments in the Keyboard section.</li>
        <li><strong>Repair and recover.</strong> Smart Repair can add a supported accessible name you can undo. Interaction Recovery surfaces observed errors or confirmations and offers Jump when a reliable field link exists.</li>
      </ol>
      <h3>Guided practice</h3>
      <p>Open the fictional catalogue. Enter “Take me to the sorting options”, then “What are my options?”. Check that the list gives actual choices and the selection stays the same. Return to this panel when ready.</p>
      <div className="button-row">
        <a href="./practice.html" target="_blank" rel="noreferrer">Open guided practice</a>
        <button type="button" className="button" onClick={dismiss}>Finish introduction</button>
        <button type="button" className="button" onClick={dismiss}>Skip introduction</button>
      </div>
    </div>
  </Section>;
}
