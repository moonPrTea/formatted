using System.Reflection;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.Text;

Console.InputEncoding = new System.Text.UTF8Encoding(false);
Console.OutputEncoding = new System.Text.UTF8Encoding(false);

if (args is ["--run", var program])
{
    try
    {
        await RuntimeCompiler.Run(program);
    }
    catch (Exception error)
    {
        await Console.Error.WriteLineAsync(error.InnerException?.Message ?? error.Message);
        Environment.ExitCode = 1;
    }

    return;
}

var serializerOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var assemblies = MefHostServices.DefaultAssemblies
    .Add(Assembly.Load("Microsoft.CodeAnalysis.Features"))
    .Add(Assembly.Load("Microsoft.CodeAnalysis.CSharp.Features"));
using var workspace = new AdhocWorkspace(MefHostServices.Create(assemblies));
var projectId = ProjectId.CreateNewId();
var referenceFolder = Path.Combine(AppContext.BaseDirectory, "winforms-ref");
var desktopReferences = XDocument.Load(Path.Combine(referenceFolder, "FrameworkList.xml"))
    .Root!.Elements("File")
    .Where(file =>
        (string?)file.Attribute("Type") == "Managed" &&
        ((string?)file.Attribute("Profile") ?? "").Split(';').Contains("WindowsForms"))
    .Select(file => Path.Combine(referenceFolder, (string)file.Attribute("AssemblyName")! + ".dll"));
// Only framework APIs belong to the user's project, not Roslyn's own dependencies.
var referenceFiles = RuntimeReferences.FrameworkAssemblies()
    .Concat(desktopReferences)
    .GroupBy(Path.GetFileNameWithoutExtension, StringComparer.OrdinalIgnoreCase)
    .Select(group => group.Last());
var frameworkMetadata = referenceFiles.Select(file => MetadataReference.CreateFromFile(file)).ToArray();
string[] currentPackageReferences = [];
var solution = workspace.CurrentSolution.AddProject(ProjectInfo.Create(projectId, VersionStamp.Create(),
    "Studio", "Studio", LanguageNames.CSharp,
    compilationOptions: new CSharpCompilationOptions(OutputKind.WindowsApplication, nullableContextOptions: NullableContextOptions.Enable),
    parseOptions: new CSharpParseOptions(LanguageVersion.Latest),
    metadataReferences: frameworkMetadata));
string[] fileNames = ["LoginForm.cs", "LoginForm.Designer.cs", "Program.cs"];
var documentIdsByFileName = fileNames.ToDictionary(name => name, _ => DocumentId.CreateNewId(projectId));
foreach (var (fileName, documentId) in documentIdsByFileName)
{
    solution = solution.AddDocument(documentId, fileName, SourceText.From(""), filePath: fileName);
}

workspace.TryApplyChanges(solution);

while (await Console.In.ReadLineAsync() is { } line)
{
    long requestId = 0;
    try
    {
        if (line.Length > 500_000)
            throw new InvalidOperationException("Request too large");
        using var request = JsonDocument.Parse(line);
        var requestData = request.RootElement;
        requestId = requestData.GetProperty("id").GetInt64();
        var operation = requestData.GetProperty("operation").GetString();

        if (operation == "package-version")
        {
            var versionRange = requestData.GetProperty("range").GetString()!;
            var availableVersions = requestData.GetProperty("versions").EnumerateArray()
                .Select(version => version.GetString()!).ToArray();
            var selectedVersion = PackageInspector.ResolveVersion(versionRange, availableVersions);
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                id = requestId,
                result = selectedVersion
            }, serializerOptions));
            continue;
        }
        if (operation == "package-validate")
        {
            var references = requestData.GetProperty("references").EnumerateArray()
                .Select(reference => reference.GetString()!).ToArray();
            PackageInspector.ValidateReferences(references);
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                id = requestId,
                result = true
            }, serializerOptions));
            continue;
        }
        if (operation == "package-install")
        {
            var installed = PackageInspector.Install(
                requestData.GetProperty("archive").GetString()!,
                requestData.GetProperty("destination").GetString()!,
                requestData.GetProperty("packageId").GetString()!,
                requestData.GetProperty("version").GetString()!);
            await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
            {
                id = requestId,
                result = installed
            }, serializerOptions));
            continue;
        }
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        var cancellationToken = timeout.Token;
        var files = requestData.GetProperty("files");
        var packageReferences = requestData.TryGetProperty("references", out var referenceEntries)
            ? referenceEntries.EnumerateArray().Select(reference => reference.GetString()!).ToArray()
            : [];
        solution = workspace.CurrentSolution;
        if (!currentPackageReferences.SequenceEqual(packageReferences))
        {
            var packageMetadata = packageReferences.Select(file => MetadataReference.CreateFromFile(file));
            solution = solution.WithProjectMetadataReferences(projectId, frameworkMetadata.Concat(packageMetadata));
        }

        foreach (var name in fileNames)
        {
            var sourceText = files.GetProperty(name).GetString() ?? "";
            if (sourceText.Length > 100_000)
                throw new InvalidOperationException("File too large");
            var document = solution.GetDocument(documentIdsByFileName[name])!;
            var previousSource = await document.GetTextAsync(cancellationToken);
            if (previousSource.ToString() != sourceText)
            {
                solution = solution.WithDocumentText(documentIdsByFileName[name], SourceText.From(sourceText));
            }
        }

        if (!workspace.TryApplyChanges(solution))
        {
            throw new InvalidOperationException("Could not update the C# workspace");
        }

        currentPackageReferences = packageReferences;
        var project = workspace.CurrentSolution.GetProject(projectId)!;
        object result;
        if (operation == "complete")
        {
            var file = requestData.GetProperty("file").GetString()!;
            var document = project.GetDocument(documentIdsByFileName[file])!;
            var text = await document.GetTextAsync(cancellationToken);
            var position = Math.Clamp(requestData.GetProperty("position").GetInt32(), 0, text.Length);
            var service = CompletionService.GetService(document) ?? throw new InvalidOperationException("C# completion service unavailable");
            var completions = await service.GetCompletionsAsync(document, position, cancellationToken: cancellationToken);
            var items = new List<object>();
            if (completions is not null)
            {
                var prefix = text.ToString(TextSpan.FromBounds(completions.Span.Start, position));
                var matchingCompletions = completions.ItemsList
                    .Where(item => item.FilterText.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .Take(100);

                foreach (var item in matchingCompletions)
                {
                    var change = await service.GetChangeAsync(document, item, cancellationToken: cancellationToken);
                    items.Add(new
                    {
                        label = item.DisplayText,
                        insertText = change.TextChange.NewText,
                        start = change.TextChange.Span.Start,
                        length = change.TextChange.Span.Length,
                        kind = item.Tags.FirstOrDefault(),
                        detail = item.InlineDescription
                    });
                }
            }
            result = new
            {
                items
            };
        }
        else if (operation == "analyze")
        {
            var compilation = (await project.GetCompilationAsync(cancellationToken))!;
            var diagnostics = compilation.GetDiagnostics(cancellationToken)
                .Where(diagnostic => diagnostic.Location.IsInSource && diagnostic.Severity >= DiagnosticSeverity.Warning)
                .Take(150)
                .Select(diagnostic =>
                {
                    var span = diagnostic.Location.GetLineSpan();
                    return new
                    {
                        file = span.Path,
                        message = diagnostic.GetMessage(),
                        code = diagnostic.Id,
                        severity = diagnostic.Severity == DiagnosticSeverity.Error ? "error" : "warning",
                        startLine = span.StartLinePosition.Line + 1,
                        startColumn = span.StartLinePosition.Character + 1,
                        endLine = span.EndLinePosition.Line + 1,
                        endColumn = span.EndLinePosition.Character + 1
                    };
                });
            result = new
            {
                diagnostics,
                form = DesignerSync.Read(files.GetProperty("LoginForm.Designer.cs").GetString()!)
            };
        }
        else if (operation == "compile")
        {
            var sources = fileNames.Select(fileName => files.GetProperty(fileName).GetString()!);
            result = RuntimeCompiler.Compile(sources, packageReferences, cancellationToken);
        }
        else if (operation == "edit")
        {
            var edit = requestData.GetProperty("edit");
            var editKind = edit.GetProperty("kind").GetString();
            if (editKind == "rename")
            {
                result = await ControlRename.Apply(
                    project,
                    edit.GetProperty("name").GetString()!,
                    edit.GetProperty("newName").GetString()!,
                    cancellationToken);
            }
            else if (editKind == "delete")
            {
                result = await ControlDelete.Apply(project, edit.GetProperty("name").GetString()!, cancellationToken);
            }
            else
            {
                result = DesignerSync.Edit(files.GetProperty("LoginForm.Designer.cs").GetString()!, edit);
            }
        }
        else
            throw new InvalidOperationException("Unknown operation");
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
        {
            id = requestId,
            result
        }, serializerOptions));
    }
    catch (Exception error)
    {
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(new
        {
            id = requestId,
            error = error.Message
        }, serializerOptions));
    }
}
