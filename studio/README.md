# Studio

Source code for the C# service and Studio interface modules.

- `app`: UI components, runtime page, services and styles.
- `electron`: service bridge, NuGet cache and preloads.
- `service`: C# backend and compatibility sources.
- `scripts`: service build and .NET runtime selection.
- `tests`: service, package and runtime widget checks.

Run `npm run build`, `npm run studio:service` and `npm run check` from the
repository root. The current build includes the form runtime; the complete
standalone Studio editor and installer still require separate integration.
