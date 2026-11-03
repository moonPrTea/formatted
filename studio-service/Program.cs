using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;
using System.Reflection;
using System.Xml.Linq;

Console.InputEncoding = new System.Text.UTF8Encoding(false);
Console.OutputEncoding = new System.Text.UTF8Encoding(false);

if (args is ["--run", var program])
{
    try { await RuntimeCompiler.Run(program); }
    catch (Exception error) { await Console.Error.WriteLineAsync(error.InnerException?.Message ?? error.Message); Environment.ExitCode = 1; }
    return;
}
var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var assemblies = MefHostServices.DefaultAssemblies
    .Add(Assembly.Load("Microsoft.CodeAnalysis.Features"))
    .Add(Assembly.Load("Microsoft.CodeAnalysis.CSharp.Features"));
using var workspace = new AdhocWorkspace(MefHostServices.Create(assemblies));
var projectId = ProjectId.CreateNewId();
var referenceFolder = Path.Combine(AppContext.BaseDirectory, "winforms-ref");
var desktopReferences = XDocument.Load(Path.Combine(referenceFolder, "FrameworkList.xml")).Root!.Elements("File")
    .Where(file => (string?)file.Attribute("Type") == "Managed" && ((string?)file.Attribute("Profile") ?? "").Split(';').Contains("WindowsForms"))
    .Select(file => Path.Combine(referenceFolder, (string)file.Attribute("AssemblyName")! + ".dll"));
// Only framework APIs belong to the user's project, not Roslyn's own dependencies.
var referenceFiles = RuntimeReferences.FrameworkAssemblies()
    .Concat(desktopReferences)
    .GroupBy(Path.GetFileNameWithoutExtension, StringComparer.OrdinalIgnoreCase).Select(group => group.Last());
var frameworkMetadata = referenceFiles.Select(file => MetadataReference.CreateFromFile(file)).ToArray();
string[] currentPackageReferences = [];
var solution = workspace.CurrentSolution.AddProject(ProjectInfo.Create(projectId, VersionStamp.Create(),
    "Studio", "Studio", LanguageNames.CSharp,
    compilationOptions: new CSharpCompilationOptions(OutputKind.WindowsApplication, nullableContextOptions: NullableContextOptions.Enable),
    parseOptions: new CSharpParseOptions(LanguageVersion.Latest),
    metadataReferences: frameworkMetadata));
string[] fileNames = ["LoginForm.cs", "LoginForm.Designer.cs", "Program.cs"];
var ids = fileNames.ToDictionary(name => name, _ => DocumentId.CreateNewId(projectId));
foreach (var (name, id) in ids) solution = solution.AddDocument(id, name, SourceText.From(""), filePath: name);
workspace.TryApplyChanges(solution);

// Only parsing and semantic analysis. Never load/compile/execute user assemblies.
while (await Console.In.ReadLineAsync() is { } line)
{
    long id = 0;
    try
    {
        if (line.Length > 500_000) throw new InvalidOperationException("Request too large");
        using var request = JsonDocument.Parse(line);
        var root = request.RootElement;
        id = root.GetProperty("id").GetInt64();
        if (root.GetProperty("operation").GetString() == "package-version")
        {
            var selected = PackageInspector.ResolveVersion(root.GetProperty("range").GetString()!, root.GetProperty("versions").EnumerateArray().Select(v => v.GetString()!).ToArray());
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, result = selected }, json));
            continue;
        }
        if (root.GetProperty("operation").GetString() == "package-validate")
        {
            PackageInspector.ValidateReferences(root.GetProperty("references").EnumerateArray().Select(v => v.GetString()!).ToArray());
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, result = true }, json));
            continue;
        }
        if (root.GetProperty("operation").GetString() == "package-install")
        {
            var installed = PackageInspector.Install(root.GetProperty("archive").GetString()!, root.GetProperty("destination").GetString()!, root.GetProperty("packageId").GetString()!, root.GetProperty("version").GetString()!);
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, result = installed }, json));
            continue;
        }
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        var token = timeout.Token;
        var files = root.GetProperty("files");
        var packageReferences = root.TryGetProperty("references", out var refs) ? refs.EnumerateArray().Select(r => r.GetString()!).ToArray() : [];
        solution = workspace.CurrentSolution;
        if (!currentPackageReferences.SequenceEqual(packageReferences))
        {
            solution = solution.WithProjectMetadataReferences(projectId, frameworkMetadata.Concat(packageReferences.Select(file => MetadataReference.CreateFromFile(file))));
            currentPackageReferences = packageReferences;
        }
        foreach (var name in fileNames)
        {
            var text = files.GetProperty(name).GetString() ?? "";
            if (text.Length > 100_000) throw new InvalidOperationException("File too large");
            var document = solution.GetDocument(ids[name])!;
            var previous = await document.GetTextAsync(token);
            if (previous.ToString() != text) solution = solution.WithDocumentText(ids[name], SourceText.From(text));
        }
        workspace.TryApplyChanges(solution);
        var project = workspace.CurrentSolution.GetProject(projectId)!;
        var operation = root.GetProperty("operation").GetString();
        object result;
        if (operation == "complete")
        {
            var file = root.GetProperty("file").GetString()!;
            var document = project.GetDocument(ids[file])!;
            var text = await document.GetTextAsync(token);
            var position = Math.Clamp(root.GetProperty("position").GetInt32(), 0, text.Length);
            var service = CompletionService.GetService(document) ?? throw new InvalidOperationException("C# completion service unavailable");
            var list = await service.GetCompletionsAsync(document, position, cancellationToken: token);
            var items = new List<object>();
            if (list is not null)
            {
                var prefix = text.ToString(TextSpan.FromBounds(list.Span.Start, position));
                foreach (var item in list.ItemsList.Where(item => item.FilterText.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)).Take(100))
                {
                    var change = await service.GetChangeAsync(document, item, cancellationToken: token);
                    items.Add(new { label = item.DisplayText, insertText = change.TextChange.NewText,
                        start = change.TextChange.Span.Start, length = change.TextChange.Span.Length,
                        kind = item.Tags.FirstOrDefault(), detail = item.InlineDescription });
                }
            }
            result = new { items };
        }
        else if (operation == "analyze")
        {
            var compilation = (await project.GetCompilationAsync(token))!;
            var diagnostics = compilation.GetDiagnostics(token).Where(d => d.Location.IsInSource && d.Severity >= DiagnosticSeverity.Warning)
                .Take(150).Select(d => { var span = d.Location.GetLineSpan(); return new {
                    file = span.Path, message = d.GetMessage(), code = d.Id,
                    severity = d.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                    startLine = span.StartLinePosition.Line + 1, startColumn = span.StartLinePosition.Character + 1,
                    endLine = span.EndLinePosition.Line + 1, endColumn = span.EndLinePosition.Character + 1 }; });
            result = new { diagnostics, form = DesignerSync.Read(files.GetProperty("LoginForm.Designer.cs").GetString()!) };
        }
        else if (operation == "compile") result = RuntimeCompiler.Compile(fileNames.Select(n => files.GetProperty(n).GetString()!), packageReferences, token);
        else if (operation == "edit")
        {
            var edit = root.GetProperty("edit");
            result = edit.GetProperty("kind").GetString() == "rename"
                ? await ControlRename.Apply(project, edit.GetProperty("name").GetString()!, edit.GetProperty("newName").GetString()!, token)
                : edit.GetProperty("kind").GetString() == "delete"
                    ? await ControlDelete.Apply(project, edit.GetProperty("name").GetString()!, token)
                    : DesignerSync.Edit(files.GetProperty("LoginForm.Designer.cs").GetString()!, edit);
        }
        else throw new InvalidOperationException("Unknown operation");
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, result }, json));
    }
    catch (Exception error)
    {
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new { id, error = error.Message }, json));
    }
}
