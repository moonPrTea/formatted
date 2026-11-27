/** Selects the newest stable .NET 10 runtime reported by the chosen host. */
export function selectStudioRuntime(output) {
  const runtimes = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^Microsoft\.NETCore\.App (10\.0\.(\d+)) \[(.+)\]$/.exec(
      line.trim(),
    );
    if (match) {
      runtimes.push({
        version: match[1],
        patch: Number(match[2]),
        directory: match[3],
      });
    }
  }
  runtimes.sort((first, second) => second.patch - first.patch);
  if (!runtimes.length) {
    throw new Error(
      'Studio requires a stable .NET 10 SDK/runtime. Set STUDIO_DOTNET to its dotnet executable.',
    );
  }
  return runtimes[0];
}
