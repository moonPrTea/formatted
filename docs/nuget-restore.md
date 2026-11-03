# Studio NuGet restore

Restore resolves managed dependencies, checks all downloaded assemblies, and
only then publishes them into the cache. Shared dependencies appear once in
the reference list. Conflicting versions fail with a message; this is not a full
NuGet dependency solver and does not backtrack to alternative version choices.

Each install is serialized within the process. Limits bound dependency depth
(12), package count (60), archive download size (30 MB each, 150 MB total) and
extracted package size (100 MB). Stable versions must satisfy the declared range.
Native runtime assets remain unsupported. Build targets and analyzers are not
extracted or executed. The original archive retains package license material.

Validated cache entries work offline. Missing or corrupt entries can be restored.
During replacement, one `.previous` sibling preserves the old version until the
new directory is installed. Failed renames restore the old cache; interrupted
renames recover on retry. Successful replacement removes that backup. Cleanup
failures are reported; older `.previous-*` directories are not migrated/deleted.
If rollback itself fails, the error identifies the retained backup path.

The offline integration test creates real package archives without external ZIP
tools and uses the actual C# inspector with a simulated NuGet server. It covers
dependency reuse, version conflicts, corrupt-cache repair and native-asset
rejection. CI requires this test on Windows, Linux and macOS with no runtime skip.
It does not connect to a PostgreSQL server or verify a live Npgsql release.
