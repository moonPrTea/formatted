using System.Reflection;

internal static class RuntimeReferences
{
    // Windows puts native DLLs alongside managed framework assemblies.
    // Inspect metadata without loading or executing any assembly.
    internal static IEnumerable<string> FrameworkAssemblies()
    {
        var directory = Path.GetDirectoryName(typeof(object).Assembly.Location)!;
        foreach (var file in Directory.GetFiles(directory, "*.dll"))
        {
            try { AssemblyName.GetAssemblyName(file); }
            catch (BadImageFormatException) { continue; }
            yield return file;
        }
    }
}
