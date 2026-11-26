import { experimental } from "./experimental";
import { NavigatorPanel } from "./components/NavigatorPanel";
import { useEffect, useState } from "react";
import type { ActivityStats, AppliedRepair, PanelState } from "../shared/types";
import type { SettingsPatch } from "../shared/messages";
import { Section } from "./components/Section";
import { PrivacyPanel } from "./components/PrivacyPanel";
import { ScanPanel } from "./components/ScanPanel";
import { RepairPanel } from "./components/RepairPanel";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { StatusPanel } from "./components/StatusPanel";
import { Introduction } from "./components/Introduction";
import { useSpeechOutput } from "./useSpeechOutput";
import { usePanelState } from "./usePanelState";
import { useRecovery } from "./useRecovery";
import { useRepair } from "./useRepair";

const REPAIR_LABEL: Record<AppliedRepair["kind"], string> = {
  "accessible-name": "Accessible name",
  "error-announcement": "Error announcement",
  "state-announcement": "State announcement",
  "focus-assist": "Focus assistance",
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StatGrid({ activity }: { activity: ActivityStats }): React.JSX.Element {
  return (
    <div className="stat-grid">
      <div className="stat">
        <span className="stat-value">{activity.inference.ruleRepairs}</span>
        <span className="stat-label">Rule repairs</span>
      </div>
      <div className="stat">
        <span className="stat-value">{activity.inference.onDeviceCalls}</span>
        <span className="stat-label">On-device calls</span>
      </div>
      <div className="stat">
        <span className="stat-value">{activity.inference.inCloudCalls}</span>
        <span className="stat-label">Cloud calls</span>
      </div>
      <div className="stat">
        <span className="stat-value">{activity.repairsApplied}</span>
        <span className="stat-label">Repairs applied</span>
      </div>
      <div className="stat">
        <span className="stat-value">{activity.repairsUndone}</span>
        <span className="stat-label">Repairs undone</span>
      </div>
      <div className="stat">
        <span className="stat-value">{activity.recoveryMessages}</span>
        <span className="stat-label">Recovery messages</span>
      </div>
    </div>
  );
}

function HistoryList({ repairs, pending, onUndo }: { repairs: AppliedRepair[]; pending: string | null; onUndo: (id: string) => void }): React.JSX.Element {
  if (repairs.length === 0) {
    return (
      <p className="empty">
        No repairs yet. The repair engine applies verified, reversible changes and records each one here.
      </p>
    );
  }
  return (
    <ul className="history">
      {repairs.map((repair) => {
        const undone = repair.undoneAt !== null;
        return (
          <li key={repair.id} className="history-item" data-testid={`repair-history-${repair.id}`}>
            <div>
              <p className="history-title">{REPAIR_LABEL[repair.kind] ?? repair.kind}</p>
              <p className="fine-print">
                {repair.elementRef.tagName.toLowerCase()} · {formatTime(repair.appliedAt)}
                {undone ? ` · undone ${formatTime(repair.undoneAt ?? "")}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="button button-small"
              onClick={() => onUndo(repair.id)}
              disabled={undone || pending === "undo"}
            >
              {undone ? "Undone" : "Undo"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SiteAccessList({
  state,
  pending,
  onDisable,
}: {
  state: PanelState;
  pending: string | null;
  onDisable: (origin: string) => void;
}): React.JSX.Element {
  if (state.enabledSites.length === 0) {
    return <p className="empty">No sites are enabled. ClearCue stays inactive everywhere until you enable a site.</p>;
  }

  return (
    <ul className="history">
      {state.enabledSites.map((site) => {
        const busy = pending === `disable:${site.origin}`;
        return (
          <li key={site.origin} className="history-item">
            <div>
              <p className="history-title">{site.origin}</p>
              <p className="fine-print">
                {site.enabledAt ? `Enabled ${formatTime(site.enabledAt)}` : "Enabled earlier"}
              </p>
            </div>
            <button
              type="button"
              className="button button-small"
              onClick={() => onDisable(site.origin)}
              disabled={busy}
              aria-busy={busy}
              aria-label={`Disable ClearCue on ${site.origin}`}
            >
              {busy ? "Disabling…" : "Disable"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SettingsForm({
  state,
  pending,
  onUpdate,
  voices,
}: {
  state: PanelState;
  pending: string | null;
  onUpdate: (patch: SettingsPatch) => Promise<void>;
  voices: readonly SpeechSynthesisVoice[];
}): React.JSX.Element {
  const { settings } = state;
  const [budget, setBudget] = useState(String(settings.maxCloudEvidenceCharacters));

  useEffect(() => {
    setBudget(String(settings.maxCloudEvidenceCharacters));
  }, [settings.maxCloudEvidenceCharacters]);

  const commitBudget = (): void => {
    const parsed = Number.parseInt(budget, 10);
    if (!Number.isFinite(parsed)) {
      setBudget(String(settings.maxCloudEvidenceCharacters));
      return;
    }
    void onUpdate({ maxCloudEvidenceCharacters: parsed });
  };

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="explanation-detail">Explanation detail</label>
        <select id="explanation-detail" value={settings.explanationDetail} disabled={pending === "settings"}
          onChange={(event) => void onUpdate({ explanationDetail: event.target.value === "concise" ? "concise" : "detailed" })}>
          <option value="detailed">Detailed</option>
          <option value="concise">Concise</option>
        </select>
      </div>
      {experimental && <div className="field">
        <label htmlFor="speech-output">Preferred speech output</label>
        <select id="speech-output" value={settings.speechOutput} disabled={pending === "settings"} aria-describedby="speech-output-help"
          onChange={(event) => void onUpdate({ speechOutput: event.target.value === "local_voice" ? "local_voice" : "screen_reader" })}>
          <option value="screen_reader">Screen reader and text</option>
          <option value="local_voice">Local voice on request</option>
        </select>
        <p className="fine-print" id="speech-output-help">Local voice reads only when you choose Read aloud. Control proactive page announcements in <a href="#recovery">Interaction Recovery</a>.</p>
      </div>}
      {experimental && settings.speechOutput === "local_voice" && <>
        <div className="field">
          <label htmlFor="speech-voice">Local voice</label>
          <select id="speech-voice" value={settings.speechVoice ?? ""} disabled={pending === "settings"}
            onChange={(event) => void onUpdate({ speechVoice: event.target.value || null })}>
            <option value="">Choose automatically from local voices</option>
            {settings.speechVoice && !voices.some((voice) => voice.voiceURI === settings.speechVoice) &&
              <option value={settings.speechVoice}>Previously selected voice is unavailable</option>}
            {voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
          </select>
          {voices.length === 0 && <p className="fine-print">Chrome has not reported a local voice.</p>}
        </div>
        <div className="field">
          <label htmlFor="speech-rate">Speech rate</label>
          <select id="speech-rate" value={settings.speechRate} disabled={pending === "settings"}
            onChange={(event) => void onUpdate({ speechRate: Number(event.target.value) })}>
            {[...new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, settings.speechRate])].sort((a, b) => a - b)
              .map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
          </select>
        </div>
      </>}
      <label className="check">
        <input
          type="checkbox"
          checked={settings.allowCloudForDiagnostics}
          onChange={(event) => void onUpdate({ allowCloudForDiagnostics: event.target.checked })}
          disabled={pending === "settings"}
        />
        <span>
          Allow cloud requests from the Firebase diagnostics page
          <span className="fine-print block">Diagnostics use hand-written fictional prompts, never the page you are reading.</span>
        </span>
      </label>

      <div className="field">
        <label htmlFor="evidence-budget">Cloud evidence budget (characters)</label>
        <input
          id="evidence-budget"
          type="number"
          min={0}
          max={4000}
          step={50}
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          onBlur={commitBudget}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitBudget();
            }
          }}
          disabled={pending === "settings"}
          aria-describedby="evidence-budget-help"
        />
        <p id="evidence-budget-help" className="fine-print">
          Hard cap on how many characters of evidence may leave the device for a single repair.
        </p>
      </div>
    </div>
  );
}

export function PanelApp(): React.JSX.Element {
  const controller = usePanelState();
  const repairController = useRepair(controller);
  const recoveryController = useRecovery(controller);
  const { state, phase, error, notice, pending } = controller;
  const scope = JSON.stringify([state?.context.tabId, state?.context.documentId, state?.context.url, state?.context.status]);
  const speech = useSpeechOutput(state?.settings, scope);
  const speak = speech.enabled ? speech.speak : undefined;

  return (
    <div className="app">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true">
          C
        </span>
        <div>
          <h1>ClearCue</h1>
          <p className="tagline">Find controls, recover from errors, and repair accessibility barriers</p>
        </div>
      </header>

      {notice ? (
        <div className={`notice notice-${notice.tone}`} role="status">
          <p>{notice.text}</p>
          <button type="button" className="notice-dismiss" onClick={controller.dismissNotice} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      <main>
        {phase === "loading" && !state ? (
          <p className="loading" role="status">
            Loading ClearCue…
          </p>
        ) : null}

        {phase === "error" || error ? (
          <section className="card" aria-labelledby="error-heading">
            <h2 id="error-heading">ClearCue could not read its state</h2>
            <p className="note">{error ?? "The extension background did not respond."}</p>
            <button type="button" className="button" onClick={() => void controller.refresh()}>
              Try again
            </button>
          </section>
        ) : null}

        {state ? (
          <>
            {speech.enabled && <Section id="local-speech" title="Local speech">
              <div className="button-row">
                <button type="button" className="button" disabled={!speech.active} onClick={speech.stop}>Stop speech</button>
                <button type="button" className="button" disabled={!speech.canRepeat} onClick={speech.repeat}>Repeat last spoken message</button>
              </div>
              <p role="status">{speech.status}</p>
            </Section>}
            <Introduction seen={state.settings.onboardingSeen}
              onComplete={() => { if (!state.settings.onboardingSeen) void controller.updateSettings({ onboardingSeen: true }); }} />
            <StatusPanel
              context={state.context}
              pending={pending}
              onEnable={controller.enableSite}
              onDisable={controller.disableSite}
              onRefresh={() => void controller.refresh()}
            />
            <NavigatorPanel key={[state.context.tabId, state.context.documentId, state.context.url].join("|")}
              context={state.context} barriers={state.scan.summary?.issueTotal ?? 0}
              recovery={state.recovery.events.filter((event) => !event.dismissedAt).length} outcome={state.recovery.latest}
              concise={state.settings.explanationDetail === "concise"} onRead={speak} />

            <RecoveryPanel
              recovery={state.recovery}
              controller={recoveryController}
              announceAutomatically={state.settings.announceRecoveryMessages}
              onToggleAutomatic={recoveryController.setAutomatic}
              concise={state.settings.explanationDetail === "concise"}
              onRead={speak}
            />

            <PrivacyPanel settings={state.settings} pending={pending} onUpdate={controller.updateSettings} />

            <Section id="sites" title="Site access" description="ClearCue only runs on sites you enable, one origin at a time.">
              <SiteAccessList state={state} pending={pending} onDisable={controller.disableOrigin} />
            </Section>

            <ScanPanel
              scan={state.scan}
              pending={pending}
              canScan={state.context.status === "connected"}
              onRescan={controller.rescan}
            />

            <RepairPanel
              state={state}
              controller={repairController}
              pending={pending}
              onRepairIssue={(issue) => void repairController.repairOne(issue)}
            />

            <Section id="history" title="Repair history" description="Every applied change stays reversible.">
              <HistoryList repairs={state.repairs} pending={pending} onUndo={controller.undo} />
            </Section>

            <Section id="settings" title="Settings" description="Privacy controls apply immediately.">
              <SettingsForm state={state} pending={pending} onUpdate={controller.updateSettings} voices={speech.voices} />
            </Section>

            <Section
              id="shortcuts"
              title="Keyboard"
              description="Shortcuts are managed by Chrome and can be changed at any time."
            >
              {state.shortcuts.length === 0 ? (
                <p className="note">Chrome did not report any ClearCue shortcuts.</p>
              ) : (
                <ul className="shortcuts">
                  {state.shortcuts.map((shortcut) => (
                    <li key={shortcut.name}>
                      <span>{shortcut.description || shortcut.name}</span>
                      <kbd>{shortcut.shortcut || "Not assigned"}</kbd>
                    </li>
                  ))}
                </ul>
              )}
              <p className="fine-print">
                Change them at <code>chrome://extensions/shortcuts</code>.
              </p>
            </Section>

            <details className="card"><summary>Advanced verification</summary>
            <Section id="stats" title="Statistics" description="Recorded only when something actually happens.">
              <StatGrid activity={state.activity} />
              <p className="fine-print">
                {state.activity.updatedAt
                  ? `Last activity ${formatTime(state.activity.updatedAt)}.`
                  : "No activity recorded yet. Applied repairs and real inference calls appear here as they happen."}
              </p>
            </Section>

            <Section id="diagnostics" title="Firebase diagnostics" description="Verify genuine hybrid inference separately from this panel.">
              <p className="note">
                The diagnostics page runs six checks against Firebase AI Logic and reports the real inference source for each one. It opens in its
                own tab.
              </p>
              <button type="button" className="button" onClick={() => void controller.openDiagnostics()}>
                Open Firebase diagnostics
              </button>
            </Section>
            </details>
          </>
        ) : null}
      </main>

      <footer className="footer">
        <p>
          ClearCue {state?.extensionVersion ?? ""} · Context Navigator ·{" "}
          {state ? `${state.context.hostPermissionGranted ? "site access granted" : "no site access"}` : "loading"}
        </p>
        <p className="fine-print">Local-first by default. Firebase AI Logic powers every inference; nothing is faked or pre-recorded.</p>
      </footer>
    </div>
  );
}
