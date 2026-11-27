using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Rename;

internal static class ControlRename
{
    internal static async Task<object> Apply(Project project, string oldName, string newName, CancellationToken token)
    {
        if (newName.Length > 128 || !SyntaxFacts.IsValidIdentifier(newName) || newName.StartsWith('@') ||
            SyntaxFacts.GetKeywordKind(newName) != SyntaxKind.None)
            throw new InvalidOperationException("Введи допустимое имя C#: например, loginButton.");
        var document = project.Documents.Single(d => d.Name == "LoginForm.Designer.cs");
        var source = (await document.GetTextAsync(token)).ToString();
        var form = DesignerSync.Read(source);
        if (!form.Editable || !form.Controls.Any(c => c.Name == oldName))
            throw new InvalidOperationException("Элемент недоступен для переименования.");
        var compilation = (await project.GetCompilationAsync(token))!;
        if (compilation.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
            throw new InvalidOperationException("Перед переименованием исправь ошибки C# в проекте.");
        var root = (await document.GetSyntaxRootAsync(token))!;
        var model = (await document.GetSemanticModelAsync(token))!;
        var fields = root.DescendantNodes().OfType<VariableDeclaratorSyntax>()
            .Select(v => model.GetDeclaredSymbol(v, token)).OfType<IFieldSymbol>()
            .Where(f => f.Name == oldName).ToArray();
        if (fields.Length != 1) throw new InvalidOperationException("Не удалось однозначно определить поле элемента.");
        var field = fields[0];
        if (newName != oldName)
        {
            for (var type = field.ContainingType; type is not null; type = type.BaseType)
                if (type.Name == newName || type.GetMembers(newName).Length != 0)
                    throw new InvalidOperationException($"Имя {newName} уже используется в форме.");
        }
        var solution = newName == oldName ? project.Solution : await Renamer.RenameSymbolAsync(
            project.Solution, field, new SymbolRenameOptions(), newName, token);
        document = solution.GetDocument(document.Id)!;
        root = (await document.GetSyntaxRootAsync(token))!;
        model = (await document.GetSemanticModelAsync(token))!;
        var renamedField = root.DescendantNodes().OfType<VariableDeclaratorSyntax>()
            .Select(v => model.GetDeclaredSymbol(v, token)).OfType<IFieldSymbol>()
            .Single(f => f.Name == newName && f.ContainingType.Name == field.ContainingType.Name);
        var method = root.DescendantNodes().OfType<MethodDeclarationSyntax>()
            .Single(m => m.Identifier.ValueText == "InitializeComponent");
        var nameAssignments = method.DescendantNodes().OfType<AssignmentExpressionSyntax>()
            .Where(a => a.Left is MemberAccessExpressionSyntax member && member.Name.Identifier.ValueText == "Name" &&
                SymbolEqualityComparer.Default.Equals(model.GetSymbolInfo(member.Expression, token).Symbol, renamedField)).ToArray();
        var literal = SyntaxFactory.LiteralExpression(SyntaxKind.StringLiteralExpression, SyntaxFactory.Literal(newName));
        if (nameAssignments.Length > 0)
            root = root.ReplaceNodes(nameAssignments, (original, _) => original.WithRight(literal.WithTriviaFrom(original.Right)));
        else
        {
            // Append after construction, never before the control has been initialized.
            var statement = SyntaxFactory.ParseStatement($"        this.{newName}.Name = {literal};\n");
            root = root.ReplaceNode(method, method.WithBody(method.Body!.AddStatements(statement)));
        }
        solution = solution.WithDocumentSyntaxRoot(document.Id, root);
        var changed = solution.GetProject(project.Id)!;
        var check = (await changed.GetCompilationAsync(token))!;
        if (check.GetDiagnostics(token).Any(d => d.Severity == DiagnosticSeverity.Error))
            throw new InvalidOperationException("Переименование вызывает конфликт C#. Исходный код не изменён.");
        var files = new Dictionary<string, string>();
        foreach (var doc in changed.Documents) files[doc.Name] = (await doc.GetTextAsync(token)).ToString();
        return new { files, name = newName };
    }
}
