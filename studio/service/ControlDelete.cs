using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

internal static class ControlDelete
{
    internal static async Task<object> Apply(Project project, string name, CancellationToken token)
    {
        var designer = project.Documents.Single(d => d.Name == "LoginForm.Designer.cs");
        var form = DesignerSync.Read((await designer.GetTextAsync(token)).ToString());
        if (!form.Editable || !form.Controls.Any(c => c.Name == name))
            throw new InvalidOperationException("Элемент недоступен для удаления.");
        var names = new HashSet<string> { name };
        while (true)
        {
            var children = form.Controls.Where(c => c.Parent is not null && names.Contains(c.Parent)).Select(c => c.Name);
            var count = names.Count;
            names.UnionWith(children);
            if (count == names.Count) break;
        }
        var compilation = (await project.GetCompilationAsync(token))!;
        if (compilation.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
            throw new InvalidOperationException("Перед удалением исправь ошибки C# в проекте.");
        var designerRoot = (await designer.GetSyntaxRootAsync(token))!;
        var designerModel = (await designer.GetSemanticModelAsync(token))!;
        var fields = designerRoot.DescendantNodes().OfType<VariableDeclaratorSyntax>()
            .Select(v => designerModel.GetDeclaredSymbol(v, token)).OfType<IFieldSymbol>()
            .Where(f => names.Contains(f.Name)).ToArray();
        if (fields.Length != names.Count)
            throw new InvalidOperationException("Не удалось определить поля удаляемых элементов.");
        bool Deleted(ISymbol? symbol) => fields.Any(f => SymbolEqualityComparer.Default.Equals(f, symbol));
        var solution = project.Solution;
        foreach (var document in project.Documents)
        {
            var root = (await document.GetSyntaxRootAsync(token))!;
            var model = (await document.GetSemanticModelAsync(token))!;
            var remove = new HashSet<SyntaxNode>();
            foreach (var identifier in root.DescendantNodes().OfType<IdentifierNameSyntax>())
            {
                if (!Deleted(model.GetSymbolInfo(identifier, token).Symbol)) continue;
                var statement = identifier.Ancestors().OfType<ExpressionStatementSyntax>().FirstOrDefault();
                var generated = document.Id == designer.Id && statement?.Parent is BlockSyntax block &&
                    block.Parent is MethodDeclarationSyntax method && method.Identifier.ValueText == "InitializeComponent";
                var subscription = statement?.Expression is AssignmentExpressionSyntax assignment &&
                    assignment.Kind() is SyntaxKind.AddAssignmentExpression or SyntaxKind.SubtractAssignmentExpression &&
                    assignment.Left is MemberAccessExpressionSyntax member &&
                    model.GetSymbolInfo(member, token).Symbol is IEventSymbol &&
                    Deleted(model.GetSymbolInfo(member.Expression, token).Symbol) && member.Expression.Span.Contains(identifier.Span) &&
                    !assignment.Right.DescendantNodesAndSelf().OfType<IdentifierNameSyntax>().Any(n => Deleted(model.GetSymbolInfo(n, token).Symbol));
                if (statement is null || (!generated && !subscription) || statement.Parent is not BlockSyntax)
                    throw new InvalidOperationException($"{identifier.Identifier.ValueText} используется в коде ({document.Name}). Удали эти обращения перед удалением элемента; код не изменён.");
                remove.Add(statement);
            }
            foreach (var field in root.DescendantNodes().OfType<FieldDeclarationSyntax>())
            {
                var variables = field.Declaration.Variables.Where(v => Deleted(model.GetDeclaredSymbol(v, token))).ToArray();
                if (variables.Length == field.Declaration.Variables.Count) remove.Add(field);
                else foreach (var variable in variables) remove.Add(variable);
            }
            var updated = root.RemoveNodes(remove, SyntaxRemoveOptions.KeepExteriorTrivia)!;
            solution = solution.WithDocumentSyntaxRoot(document.Id, updated);
        }
        var changed = solution.GetProject(project.Id)!;
        var check = (await changed.GetCompilationAsync(token))!;
        if (check.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
            throw new InvalidOperationException("Удаление нарушает код C#. Исходные файлы сохранены без изменений.");
        var files = new Dictionary<string, string>();
        foreach (var document in changed.Documents)
            files[document.Name] = (await document.GetTextAsync(token)).ToString();
        return new { files, name = "", removed = names.ToArray() };
    }
}
