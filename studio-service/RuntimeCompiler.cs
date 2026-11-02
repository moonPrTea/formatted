using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

internal static class RuntimeCompiler
{
    internal static object Compile(IEnumerable<string> sources, string[] packageReferences, CancellationToken token)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.Compat.cs")!;
        var compatibility = new StreamReader(stream).ReadToEnd();
        using var defaultsStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.ControlDefaults.cs")!;
        var defaults = new StreamReader(defaultsStream).ReadToEnd();
        using var gridStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.GridCompat.cs")!;
        var grid = new StreamReader(gridStream).ReadToEnd();
        var trees = sources.Append(compatibility).Append(defaults).Append(grid).Select(s => CSharpSyntaxTree.ParseText(s, cancellationToken: token));
        var references = RuntimeReferences.FrameworkAssemblies()
            .Concat(packageReferences)
            .Select(p => MetadataReference.CreateFromFile(p));
        var compilation = CSharpCompilation.Create("StudioUser", trees, references,
            new CSharpCompilationOptions(OutputKind.ConsoleApplication, nullableContextOptions: NullableContextOptions.Enable));
        using var output = new MemoryStream();
        var result = compilation.Emit(output, cancellationToken: token);
        if (!result.Success)
        {
            var errors = result.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Take(10);
            throw new InvalidOperationException("Mac runtime: " + string.Join("\n", errors.Select(d => d.GetMessage())) +
                "\nПоддерживается ограниченный WinForms API, не полная Windows Forms.");
        }
        return new { assembly = Convert.ToBase64String(output.ToArray()) };
    }
    internal static async Task Run(string path)
    {
        // This is a separate process, entered only after the user's explicit Run.
        // It is not a security sandbox. Never load user code in the analysis host.
        Console.SetOut(Console.Error);
        System.Runtime.Loader.AssemblyLoadContext.Default.Resolving += (context, name) =>
        {
            if (name.Name is null || Path.GetFileName(name.Name) != name.Name) return null;
            var dependency = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(path))!, name.Name + ".dll");
            return File.Exists(dependency) ? context.LoadFromAssemblyPath(dependency) : null;
        };
        var assembly = System.Runtime.Loader.AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(path));
        var entry = assembly.EntryPoint ?? throw new InvalidOperationException("Не найден Main.");
        var result = entry.Invoke(null, entry.GetParameters().Length == 0 ? null : [Array.Empty<string>()]);
        if (result is Task task) await task;
    }
}
