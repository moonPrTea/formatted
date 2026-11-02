# Building the Studio backend

Install a stable .NET 10 SDK, then run from the repository root:

```sh
npm ci
npm run build
npm run studio:service
```

The service build uses `STUDIO_DOTNET` if set, otherwise the local
`.tools/dotnet/dotnet` (`dotnet.exe` on Windows), otherwise `dotnet` on PATH.
`STUDIO_DOTNET` names the executable, not the SDK directory.

The build selects the newest stable installed Microsoft.NETCore.App 10.0 patch,
publishes for the current OS/CPU, and copies a private host, resolver, runtime
and available license notices into `build/studio-runtime`. No SDK is shipped.
There is no dependency on an exact runtime patch directory such as 10.0.13.
Backend assemblies and Windows reference assemblies go into `build/studio-backend`.
Failed compilation or runtime copying leaves previous output directories intact.
Do not run a build while a service is using these directories.

Run the service tests without permitting missing-runtime skips:

```sh
STUDIO_SERVICE_REQUIRED=1 node --test tests/studio.test.js tests/studio-delete.test.js tests/studio-runtime-files.test.js
```

In PowerShell, set `$env:STUDIO_SERVICE_REQUIRED = '1'` before the Node command.
The `studio-service` CI matrix installs the SDK, builds the backend, and runs
these tests on macOS, Windows and Linux. This checks the published C# backend;
it does not certify the still-unpublished Studio editor or full app packaging.

The service uses UTF-8 for its JSON protocol on all platforms. Framework
references exclude native DLLs that Windows stores beside managed assemblies.

## Review follow-ups

- Publish the editor, preload/window wiring, terminal and frontend build
  dependencies in buildable steps, then add a clean-checkout Studio UI test.
- The local NuGet restore implementation retains `.previous-*` cache backups
  after successful replacement. Add bounded cleanup and restore-failure tests.
- The current local asset deletions (`src/assets/forma.png` and `forma.svg`)
  need reconciliation with UI/build references before publishing that UI diff.
