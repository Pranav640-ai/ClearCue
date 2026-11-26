import { useState } from "react";
import type { ExtensionSettings } from "../../shared/types";

interface PrivacyPanelProps {
  settings: ExtensionSettings;
  pending: string | null;
  onUpdate: (patch: Partial<Omit<ExtensionSettings, "schemaVersion">>) => Promise<void>;
}

function formatOptIn(value: string | null): string {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function PrivacyPanel({ settings, pending, onUpdate }: PrivacyPanelProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const cloudAllowed = settings.privacyMode === "cloud_allowed";
  const busy = pending === "settings";

  return (
    <section className="card" aria-labelledby="privacy-heading">
      <div className="card-head">
        <div>
          <h2 id="privacy-heading">Privacy</h2>
          <p className="card-description">You decide whether anything from a page may reach the cloud.</p>
        </div>
        <span className={`badge ${cloudAllowed ? "badge-cloud" : "badge-local"}`}>{cloudAllowed ? "Cloud allowed" : "Local only"}</span>
      </div>

      <p className="note">
        {cloudAllowed
          ? "Local on-device inference is tried first. If it cannot decide, ClearCue may send a short, evidence-classified description to Gemini."
          : "All analysis stays on this device. Page content is never sent to a server."}
      </p>

      <ul className="policy-list">
        <li>Never sent: form values, passwords, payment details, full page text, browsing history.</li>
        <li>May be sent when allowed: the specific labels and structure needed for one repair, and never more than your character budget.</li>
        <li>Repairs are applied on request. If you enable automatic repair, only supported rules run automatically. Every repair is reversible.</li>
      </ul>

      {cloudAllowed ? (
        <div className="stack">
          <p className="fine-print">Cloud allowed since {formatOptIn(settings.cloudOptInAt)}.</p>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void onUpdate({ privacyMode: "local_only" })}
            disabled={busy}
            aria-busy={busy}
          >
            Switch back to local-only
          </button>
        </div>
      ) : confirming ? (
        <div className="confirm-box">
          <p>
            When a repair cannot be decided on this device, ClearCue may send a minimal description of the problem to Gemini. On-device inference
            is always tried first, and form values, passwords and full page text are never sent.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                setConfirming(false);
                void onUpdate({ privacyMode: "cloud_allowed" });
              }}
              disabled={busy}
              aria-busy={busy}
            >
              Yes, allow cloud inference
            </button>
            <button type="button" className="button button-quiet" onClick={() => setConfirming(false)}>
              Keep local only
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="button" onClick={() => setConfirming(true)} disabled={busy}>
          Allow cloud inference…
        </button>
      )}
    </section>
  );
}
