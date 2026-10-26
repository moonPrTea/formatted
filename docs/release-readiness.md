# Release readiness

This is a staged release plan, not a claim that the entire local Studio suite is
already published or supported on every OS.

## Reproducible checks

Run from a fresh checkout with Node 22.12+ and Python 3.9+:

```sh
npm ci
npm run check
python -m unittest discover -s tests -p '*_test.py'
npm audit --audit-level=high
npm run test:ui
npm run package:preview
node tests/packaged-smoke.cjs
```

The main CI matrix performs types, lint, unit tests, Python tests, dependency
audit, native packaging and a real packaged-launch check on Linux, Windows and
macOS. The complete committed Electron UI suite runs on macOS. Linux's packaged
smoke test uses Xvfb; its runner-only AppArmor setting permits Chromium's user
namespace sandbox. The shipped application does not disable its sandbox.

Preview artifacts contain a native app directory in `.tar.gz` plus a SHA-256
checksum. The archive retains macOS framework symlinks and Unix executable bits.
Builds use the runner's architecture; this matrix does not yet certify Intel Macs,
Windows ARM64 or Linux ARM64. Download the artifact matching both OS and CPU.
These are unsigned test builds, not installers, notarized releases or automatic
updates. No GitHub Release or tag is published by the workflow.

The preview packager deliberately rejects a working tree with the standalone
Studio launcher: the current local suite needs its own platform-aware packaging.
It must not silently ship a main app whose Studio/Sheets buttons cannot launch
their companion apps. Test the exact commit, not an unrelated dirty worktree.

## Review findings and remaining release gates

The review combines whole-project type/lint/test execution with targeted reading
of IPC trust checks, file persistence, NuGet restore, C# process execution, native
launchers and packaging. It is not a security certification or a claim that every
possible user interaction was manually exercised.

- Electron 44.5.1 and transitive undici 7.30.0 had high-severity advisories.
  Electron is now pinned to 44.9.3; the lockfile updates undici to a fixed version.
- The core app now exits after its last window closes on macOS as well as other
  platforms, and honors an explicit isolated user-data directory in launch tests.
- Both source and committed-snapshot tests are needed while large local changes
  remain. Native C# tests skip in a clean checkout without the private .NET host;
  a green core CI result does not certify the unpublished Studio integration.
- Local standalone launchers currently expect macOS `.app` bundle paths.
  Add Windows/Linux companion executable paths before publishing the full suite.
- The Studio installer currently targets macOS, the terminal rejects Windows,
  and the private runtime builder assumes a specific .NET runtime directory.
  Build and test the host/runtime and node-pty for every OS/CPU combination.
- User C# code runs as the current user in a separate process, not a security
  sandbox. Imported projects/packages must be trusted before running them.
- App signing/notarization, Windows signing, installer formats, update delivery,
  license notices and release-version policy remain separate release gates.
- Split the remaining work into buildable commits: shared UI/welcome screens,
  Sheets changes, Studio editor, runtime/terminal, NuGet dependencies, then suite
  packaging. Each commit must include its dependencies and relevant tests.

External Calc integration additionally has two real-LibreOffice checks:

```sh
python tests/calc_native.py --soffice /path/to/soffice
python tests/calc_work_native.py --soffice /path/to/soffice
```

## TypeScript and JavaScript style

Use the [TypeScript guide](https://ts.dev/style/) and
[Google JavaScript guide](https://google.github.io/styleguide/jsguide.html).
The latter is no longer maintained and recommends TypeScript. The project already
uses `gts`, strict TypeScript and its Prettier configuration. Prefer named exports,
descriptive names, `const`, `unknown` at external boundaries, explicit validation,
handled promise failures, and comments explaining intent rather than repeating
types. Keep existing kebab-case filenames and NodeNext `.js`/`.cjs` import paths.

The existing lint command covers TS/CTS application code, not every JS/CJS test
and MJS helper. Do not interpret a green lint run as complete guide compliance.
Apply style changes in bounded, behavior-preserving commits; avoid a repository-
wide rename/reformat mixed with functional release fixes.

## Backend and authentication

Keep the first release local-first and usable without an account. CSV/SQL lessons,
spreadsheet editing, progress and files do not require a remote backend. Electron's
main process handles native access; Studio's local .NET service handles Roslyn and
code execution. Neither requires an internet-facing account service.

Introduce an optional remote backend only for a concrete product feature such as
cross-device sync, shared projects, teacher groups or licensing. Decide conflict
resolution, offline behavior, export/deletion and retention before adding sync.
Authentication alone does not solve these problems and should not block local work.

If accounts become necessary, use an established identity provider with the system
browser and authorization-code/PKCE flow; never ship a client secret in Electron
or store passwords yourself. Keep tokens in the OS credential store. Do not send
project code, exercise data or progress to a server without an explicit feature
and user consent. No cloud backend or authentication is added by this change.
