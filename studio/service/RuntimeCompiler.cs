using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

internal static class RuntimeCompiler
{
    internal static object Compile(IEnumerable<string> sources, string[] packageReferences, CancellationToken cancellationToken)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.Compat.cs")!;
        var compatibility = new StreamReader(stream).ReadToEnd();
        using var defaultsStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.ControlDefaults.cs")!;
        var defaults = new StreamReader(defaultsStream).ReadToEnd();
        using var gridStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Studio.GridCompat.cs")!;
        var grid = new StreamReader(gridStream).ReadToEnd();
        var syntaxTrees = sources.Append(compatibility).Append(defaults).Append(grid)
            .Select(source => CSharpSyntaxTree.ParseText(source, cancellationToken: cancellationToken));
        var references = RuntimeReferences.FrameworkAssemblies()
            .Concat(packageReferences)
            .Select(referencePath => MetadataReference.CreateFromFile(referencePath));
        var compilation = CSharpCompilation.Create("StudioUser", syntaxTrees, references,
            new CSharpCompilationOptions(OutputKind.ConsoleApplication, nullableContextOptions: NullableContextOptions.Enable));
        using var output = new MemoryStream();
        var compilationResult = compilation.Emit(output, cancellationToken: cancellationToken);
        if (!compilationResult.Success)
        {
            var errors = compilationResult.Diagnostics
                .Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error)
                .Take(10);
            throw new InvalidOperationException("Mac runtime: " + string.Join("\n", errors.Select(diagnostic => diagnostic.GetMessage())) +
                "\nПоддерживается ограниченный WinForms API, не полная Windows Forms.");
        }
        return new
        {
            assembly = Convert.ToBase64String(output.ToArray())
        };
    }

    internal static async Task Run(string path)
    {
        // This is a separate process, entered only after the user's explicit Run.
        // It is not a security sandbox. Never load user code in the analysis host.
        Console.SetOut(Console.Error);
        System.Runtime.Loader.AssemblyLoadContext.Default.Resolving += (context, name) =>
        {
            if (name.Name is null || Path.GetFileName(name.Name) != name.Name)
                return null;
            var dependency = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(path))!, name.Name + ".dll");
            return File.Exists(dependency) ? context.LoadFromAssemblyPath(dependency) : null;
        };
        var assembly = System.Runtime.Loader.AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(path));
        var entryPoint = assembly.EntryPoint ?? throw new InvalidOperationException("Не найден Main.");
        var result = entryPoint.Invoke(null, entryPoint.GetParameters().Length == 0 ? null : [Array.Empty<string>()]);
        if (result is Task task)
            await task;
    }
}
