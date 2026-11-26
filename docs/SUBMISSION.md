# ClearCue · #BuildHybridAI entry

## Devpost description

ClearCue helps screen-reader users continue when websites leave controls unnamed or show feedback that never reaches their screen reader. **Smart Repair** adds a reversible accessible name to eligible controls. **Context Lens** explains the focused control in its section and can distinguish competing destinations. **Interaction Recovery** surfaces observed outcomes, such as a silent validation error, and offers a jump to the affected field when the association is grounded. The user decides what to enter and submit.

ClearCue uses Firebase AI Logic for adaptive inference. Deterministic rules handle common grounded cases and support offline operation. Eligible unresolved cases can use Gemini Nano on supported Chrome. For a consented cloud escalation, ClearCue sends bounded eligible text through Firebase AI Logic with App Check. Images and contextual navigation evidence stay local. An independent validator checks proposals before a write, and the extension displays SDK-confirmed provenance. Guided Navigation, Page Map and typed focus commands support the same workflow.

A configured browser run verified an actual cloud repair and exact Undo. Controlled offline runs verified the scholarship workflow. Frozen ClearBench v1 detected four planted barriers, correctly repaired two and abstained on two. These are fixture results. Current on-device repair and visual inference remain unverified, and user preference or population-level impact has yet to be measured.

## Official compliance

| Requirement | Current status |
| --- | --- |
| Web (Chrome) and Gemini Nano 4 through Firebase AI Logic | Runtime integration implemented. Historical text and structured diagnostics showed on-device provenance. Current repair and visual inference require owner verification. |
| Firebase AI Logic and App Check | Configured cloud repair verified. Public ZIP excludes credentials. Rules permit debug tokens for submissions. Use the private setup below. |
| Public GitHub or GitLab source with open-source license | Apache-2.0 license and dependency notices included. Sanitized source snapshot prepared for owner publication. |
| Working project access through judging | Clean ZIP and private configuration prepared. Recipient access remains pending. Ask the manager how to provide private judge-only App Check provisioning without embedding a reusable token in submission materials. |
| Public YouTube demonstration with English speech or subtitles | Recording and upload pending. Keep it within three minutes. |
| Description and platform | Use the copy above and select Web (Chrome). Disclose applicable prior work. |
| Hosting | Hosted project URL encouraged. Firebase Hosting config serves the fictional fixtures. |
| Schedule | Submission closes November 30, 2026 at 22:00 UTC, December 1 at 3:30 a.m. IST. Judging runs December 10 at 9:00 a.m. to December 16 at 2:00 p.m. Pacific. |

[Official rules](https://firebasehybridaihackathon.devpost.com/rules) · [Official dates](https://firebasehybridaihackathon.devpost.com/details/dates)

## Public source and hosting

Create the public repository from an archive of the reviewed local commit. Git export rules omit the private owner and QA files. Run these commands in PowerShell from the private repository. Use a new empty destination.

```powershell
New-Item -ItemType Directory -Force artifacts/source | Out-Null
git archive --format=zip --output=artifacts/source/clearcue-public-source.zip HEAD
Expand-Archive -LiteralPath artifacts/source/clearcue-public-source.zip -DestinationPath ../ClearCue-public
Set-Location ../ClearCue-public
git init -b main
git add .
git diff --cached --check
git commit -m "Release ClearCue 0.5.0"
git remote add origin https://github.com/Pranav640-ai/ClearCue.git
git ls-remote --heads origin
```

Inspect the staged source and its secret scan before publishing. When the intended remote has no branches and the owner authorizes publication, run `git push -u origin main`. If the remote has changed, inspect it before proceeding. Create a GitHub release and attach the clean extension ZIP and recorded checksum. Review source, license and ZIP while signed out.

For optional hosting, use the owner’s Firebase project from the source root.

```powershell
npx.cmd --yes --package firebase-tools firebase login
npx.cmd --yes --package firebase-tools firebase hosting:sites:list --project YOUR_PROJECT_ID
npx.cmd --yes --package firebase-tools firebase deploy --only hosting --project YOUR_PROJECT_ID
```

After the authorized deployment, verify `/recovery.html`, `/visual-repair.html` and `/member-portal.html`. The extension ZIP is a separate download. [Judge setup](STAGE7_RELEASE.md#judge-testing-with-firebase) · [Recording script](DEMO_SCRIPT.md)
