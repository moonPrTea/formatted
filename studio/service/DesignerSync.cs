using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using FormattedStudioInternal;

internal record ControlModel(string Name, string Type, string Text, int X, int Y, int Width, int Height,
    string BackColor, string ForeColor, bool Enabled, bool Visible, bool Checked, string? Parent);
internal record FormModel(bool Editable, string[] Warnings, ControlModel[] Controls, int Width = 440, int Height = 300, string Text = "");

internal static class DesignerSync
{
    internal static readonly HashSet<string> Types = new("Button Label TextBox CheckBox RadioButton ComboBox ListBox PictureBox Panel GroupBox DataGridView ProgressBar".Split(' '));
    static string Name(ExpressionSyntax expression) => expression switch {
        IdentifierNameSyntax identifier => identifier.Identifier.ValueText,
        MemberAccessExpressionSyntax { Expression: ThisExpressionSyntax } member => member.Name.Identifier.ValueText,
        _ => ""
    };
    static string TypeName(TypeSyntax type) => type.ToString().Split('.').Last();
    static MethodDeclarationSyntax? Method(SyntaxNode root) => root.DescendantNodes().OfType<MethodDeclarationSyntax>()
        .SingleOrDefault(m => m.Identifier.ValueText == "InitializeComponent");
    static bool Literal(ExpressionSyntax? expression, out object? value)
    {
        value = null;
        if (expression is LiteralExpressionSyntax literal) { value = literal.Token.Value; return true; }
        if (expression is PrefixUnaryExpressionSyntax unary && unary.IsKind(SyntaxKind.UnaryMinusExpression) && unary.Operand is LiteralExpressionSyntax n && n.Token.Value is int i) { value = -i; return true; }
        return false;
    }
    static bool Pair(ExpressionSyntax expression, out int first, out int second)
    {
        first = second = 0;
        var args = expression switch { ObjectCreationExpressionSyntax c => c.ArgumentList?.Arguments,
            ImplicitObjectCreationExpressionSyntax c => c.ArgumentList.Arguments, _ => null };
        if (args is not { Count: 2 } || !Literal(args.Value[0].Expression, out var a) || !Literal(args.Value[1].Expression, out var b) || a is not int x || b is not int y) return false;
        first = x; second = y; return true;
    }
    static string? Color(ExpressionSyntax expression)
    {
        if (expression is MemberAccessExpressionSyntax member && member.Expression.ToString() is "Color" or "System.Drawing.Color")
            return member.Name.Identifier.ValueText switch { "White" => "#ffffff", "Black" => "#000000", "Red" => "#ff0000", "Blue" => "#0000ff", "Green" => "#008000", "Gray" => "#808080", _ => null };
        if (expression is InvocationExpressionSyntax call && call.Expression.ToString() is "ColorTranslator.FromHtml" or "System.Drawing.ColorTranslator.FromHtml" && call.ArgumentList.Arguments.Count == 1 && Literal(call.ArgumentList.Arguments[0].Expression, out var raw) && raw is string hex && System.Text.RegularExpressions.Regex.IsMatch(hex, "^#[0-9a-fA-F]{6}$")) return hex;
        return null;
    }
    internal static FormModel Read(string source)
    {
        var root = CSharpSyntaxTree.ParseText(source).GetRoot();
        var warnings = new List<string>();
        if (root.ContainsDiagnostics) return new(false, ["Исправь синтаксические ошибки в Designer.cs. Последний корректный вид формы сохранён."], []);
        MethodDeclarationSyntax? method;
        try { method = Method(root); } catch { return new(false, ["Найдено несколько InitializeComponent."], []); }
        if (method?.Body is null) return new(false, ["Не найден InitializeComponent с телом метода."], []);
        var expressions = method.Body.Statements.OfType<ExpressionStatementSyntax>().Select(s => s.Expression).ToArray();
        var assignments = expressions.OfType<AssignmentExpressionSyntax>().ToArray();
        foreach (var statement in method.Body.Statements)
        {
            if (statement is not ExpressionStatementSyntax { Expression: AssignmentExpressionSyntax or InvocationExpressionSyntax })
                warnings.Add("Динамические инструкции редактируются только в коде.");
        }
        var controls = new Dictionary<string, ControlModel>();
        var fields = method.Ancestors().OfType<ClassDeclarationSyntax>().First().Members.OfType<FieldDeclarationSyntax>()
            .SelectMany(field => field.Declaration.Variables.Select(variable => variable.Identifier.ValueText)).ToHashSet();
        foreach (var assignment in assignments)
        {
            var name = Name(assignment.Left);
            if (assignment.Right is ObjectCreationExpressionSyntax creation && fields.Contains(name))
            {
                var type = TypeName(creation.Type);
                if (!Types.Contains(type)) { warnings.Add($"{name}: {type} пока не поддерживается визуальным редактором."); continue; }
                if (creation.Initializer is not null || creation.ArgumentList?.Arguments.Count > 0)
                    warnings.Add($"{name}: инициализатор или конструктор с параметрами редактируется только в коде.");
                var size = ControlDefaults.Size(type);
                if (!controls.TryAdd(name, new(name, type, "", 0, 0, size.Width, size.Height, ControlDefaults.Background(type), "#000000", true, true, false, null)))
                    warnings.Add($"{name}: повторное создание элемента.");
            }
        }
        if (controls.Count > 100) return new(false, ["Визуальный редактор поддерживает до 100 элементов."], []);
        int formWidth = 440, formHeight = 300;
        string formText = "";
        var seen = new HashSet<string>();
        foreach (var assignment in assignments)
        {
            if (assignment.IsKind(SyntaxKind.AddAssignmentExpression)) { warnings.Add("Обработчики событий в InitializeComponent редактируются только в коде. Перенеси подписку в конструктор формы."); continue; }
            if (!assignment.IsKind(SyntaxKind.SimpleAssignmentExpression)) { warnings.Add("Составное присваивание редактируется только в коде."); continue; }
            if (assignment.Left is not MemberAccessExpressionSyntax member || member.Expression is ThisExpressionSyntax && controls.ContainsKey(member.Name.Identifier.ValueText))
            {
                if (assignment.Right is not ObjectCreationExpressionSyntax || !controls.ContainsKey(Name(assignment.Left))) warnings.Add("Неизвестное присваивание в InitializeComponent.");
                continue;
            }
            var name = Name(member.Expression); var property = member.Name.Identifier.ValueText;
            if (member.Expression is ThisExpressionSyntax && property == "Text" && Literal(assignment.Right, out var title) && title is string text) { formText = text; continue; }
            if (member.Expression is ThisExpressionSyntax && property == "ClientSize" && Pair(assignment.Right, out var fw, out var fh)) { formWidth = fw; formHeight = fh; continue; }
            if (!controls.TryGetValue(name, out var c)) { warnings.Add($"{assignment.Left}: свойство пока не поддерживается дизайнером."); continue; }
            if (!seen.Add(name + "." + property)) warnings.Add($"{name}.{property}: повторное присваивание.");
            var rhs = assignment.Right; var literal = Literal(rhs, out var value);
            switch (property)
            {
                case "Text" when literal && value is string s: c = c with { Text = s }; break;
                case "Location" when Pair(rhs, out var x, out var y): c = c with { X = x, Y = y }; break;
                case "Size" when Pair(rhs, out var w, out var h): c = c with { Width = w, Height = h }; break;
                case "Width" when literal && value is int w: c = c with { Width = w }; break;
                case "Height" when literal && value is int h: c = c with { Height = h }; break;
                case "Left" when literal && value is int x: c = c with { X = x }; break;
                case "Top" when literal && value is int y: c = c with { Y = y }; break;
                case "Enabled" when literal && value is bool b: c = c with { Enabled = b }; break;
                case "Visible" when literal && value is bool b: c = c with { Visible = b }; break;
                case "Checked" when literal && value is bool b: c = c with { Checked = b }; break;
                case "BackColor" when Color(rhs) is string color: c = c with { BackColor = color }; break;
                case "ForeColor" when Color(rhs) is string color: c = c with { ForeColor = color }; break;
                case "Name" when literal && value is string: break;
                default:
                    if (assignment.IsKind(SyntaxKind.SimpleAssignmentExpression)) warnings.Add($"{name}.{property}: выражение или свойство пока не поддерживается дизайнером.");
                    break;
            }
            controls[name] = c;
        }
        var attached = new HashSet<string>();
        foreach (var call in expressions.OfType<InvocationExpressionSyntax>())
        {
            if (call.Expression.ToString() is "SuspendLayout" or "ResumeLayout" or "PerformLayout" or "this.SuspendLayout" or "this.ResumeLayout" or "this.PerformLayout") continue;
            if (call.Expression is not MemberAccessExpressionSyntax { Name.Identifier.ValueText: "Add" } add || call.ArgumentList.Arguments.Count != 1) { warnings.Add($"{call.Expression}: вызов редактируется только в коде."); continue; }
            string? parent;
            if (add.Expression is IdentifierNameSyntax { Identifier.ValueText: "Controls" }) parent = null;
            else if (add.Expression is MemberAccessExpressionSyntax { Name.Identifier.ValueText: "Controls" } owner)
                parent = owner.Expression is ThisExpressionSyntax ? null : Name(owner.Expression);
            else { warnings.Add($"{call.Expression}: неподдерживаемый контейнер."); continue; }
            var name = Name(call.ArgumentList.Arguments[0].Expression);
            if (!controls.TryGetValue(name, out var c)) { warnings.Add("Controls.Add с неизвестным элементом."); continue; }
            if (!attached.Add(name)) warnings.Add($"{name}: повторное добавление в Controls.");
            if (parent is not null && (!controls.TryGetValue(parent, out var container) || container.Type is not ("Panel" or "GroupBox"))) warnings.Add($"{name}: неподдерживаемый контейнер.");
            controls[name] = c with { Parent = parent };
        }
        foreach (var c in controls.Values)
        {
            if (!attached.Contains(c.Name)) warnings.Add($"{c.Name}: отсутствует Controls.Add.");
            if (c.Width is < 8 or > 2000 || c.Height is < 8 or > 2000 || c.X is < 0 or > 2000 || c.Y is < 0 or > 2000) warnings.Add($"{c.Name}: геометрия вне диапазона визуального редактора.");
            var chain = new HashSet<string> { c.Name }; var parent = c.Parent;
            while (parent is not null && controls.TryGetValue(parent, out var next)) { if (!chain.Add(parent)) { warnings.Add("Циклическая вложенность элементов."); break; } parent = next.Parent; }
        }
        if (formWidth is < 100 or > 2000 || formHeight is < 100 or > 2000) warnings.Add("Размер формы вне диапазона 100–2000.");
        return new(warnings.Count == 0, warnings.Distinct().ToArray(), controls.Values.ToArray(), formWidth, formHeight, formText);
    }
    internal static object Edit(string source, JsonElement edit)
    {
        var form = Read(source);
        if (!form.Editable) throw new InvalidOperationException(string.Join(" ", form.Warnings));
        var kind = edit.GetProperty("kind").GetString();
        var root = CSharpSyntaxTree.ParseText(source).GetRoot();
        var method = Method(root)!;
        if (kind == "add")
        {
            var type = edit.GetProperty("type").GetString()!;
            if (!Types.Contains(type) || form.Controls.Length >= 100) throw new InvalidOperationException("Unsupported control or limit reached");
            var prefix = char.ToLowerInvariant(type[0]) + type[1..]; int index = 1;
            var identifiers = root.DescendantTokens().Where(t => t.IsKind(SyntaxKind.IdentifierToken)).Select(t => t.ValueText).ToHashSet();
            while (identifiers.Contains(prefix + index)) index++;
            var name = prefix + index;
            var size = ControlDefaults.Size(type);
            // Prefer a free spot inside the form; never place every new item at 24,220.
            var x = 12; var y = 12; var placed = false;
            for (var top = 12; top + size.Height <= form.Height - 12 && !placed; top += 12)
                for (var left = 12; left + size.Width <= form.Width - 12; left += 12)
                    if (!form.Controls.Any(c => c.Parent is null && left < c.X + c.Width + 6 && left + size.Width + 6 > c.X && top < c.Y + c.Height + 6 && top + size.Height + 6 > c.Y))
                    { x = left; y = top; placed = true; break; }
            if (!placed)
            {
                x = Math.Min(12 + form.Controls.Length % 8 * 12, Math.Max(0, form.Width - size.Width));
                y = Math.Min(12 + form.Controls.Length % 8 * 12, Math.Max(0, form.Height - size.Height));
            }
            var declaration = method.Ancestors().OfType<ClassDeclarationSyntax>().First();
            var statements = $"\n        {name} = new System.Windows.Forms.{type}();\n        {name}.Name = {JsonSerializer.Serialize(name)};\n        {name}.Text = {JsonSerializer.Serialize(ControlDefaults.Text(type, name))};\n        {name}.Location = new System.Drawing.Point({x}, {y});\n        {name}.Size = new System.Drawing.Size({size.Width}, {size.Height});\n        Controls.Add({name});\n";
            var parsed = (BlockSyntax)SyntaxFactory.ParseStatement("{" + statements + "}");
            var updated = declaration.ReplaceNode(method, method.WithBody(method.Body!.WithStatements(method.Body.Statements.AddRange(parsed.Statements))));
            updated = updated.AddMembers(SyntaxFactory.ParseMemberDeclaration($"\n    private System.Windows.Forms.{type} {name} = null!;\n")!);
            return new { source = root.ReplaceNode(declaration, updated).ToFullString(), name };
        }
        var control = form.Controls.SingleOrDefault(c => c.Name == edit.GetProperty("name").GetString()) ?? throw new InvalidOperationException("Unknown control");
        var values = new Dictionary<string, string>();
        if (kind == "geometry")
        {
            int Number(string key, int min) { var n = edit.GetProperty(key).GetInt32(); if (n < min || n > 2000) throw new InvalidOperationException("Invalid geometry"); return n; }
            values["Location"] = $"new System.Drawing.Point({Number("x", 0)}, {Number("y", 0)})";
            values["Size"] = $"new System.Drawing.Size({Number("width", 8)}, {Number("height", 8)})";
            if (method.Body!.DescendantNodes().OfType<AssignmentExpressionSyntax>().Any(a => a.Left is MemberAccessExpressionSyntax m && Name(m.Expression) == control.Name && m.Name.Identifier.ValueText is "Left" or "Top" or "Width" or "Height"))
                throw new InvalidOperationException("Для перемещения используй Location и Size вместо отдельных Left/Top/Width/Height.");
        }
        else if (kind == "property")
        {
            var property = edit.GetProperty("property").GetString()!; var value = edit.GetProperty("value");
            if (property == "Checked" && control.Type is not ("CheckBox" or "RadioButton")) throw new InvalidOperationException("Этот элемент не имеет Checked.");
            values[property] = property switch {
                "Text" when value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= 500 => SyntaxFactory.LiteralExpression(SyntaxKind.StringLiteralExpression, SyntaxFactory.Literal(value.GetString()!)).ToFullString(),
                "Enabled" or "Visible" or "Checked" when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean() ? "true" : "false",
                "BackColor" or "ForeColor" when value.ValueKind == JsonValueKind.String && System.Text.RegularExpressions.Regex.IsMatch(value.GetString()!, "^#[0-9a-fA-F]{6}$") => $"System.Drawing.ColorTranslator.FromHtml({JsonSerializer.Serialize(value.GetString())})",
                _ => throw new InvalidOperationException("Unsupported property") };
        }
        else throw new InvalidOperationException("Unknown edit");
        foreach (var (property, value) in values)
        {
            method = Method(root)!;
            var assignment = method.Body!.DescendantNodes().OfType<AssignmentExpressionSyntax>().SingleOrDefault(a => a.Left is MemberAccessExpressionSyntax m && Name(m.Expression) == control.Name && m.Name.Identifier.ValueText == property);
            if (assignment is not null) root = root.ReplaceNode(assignment.Right, SyntaxFactory.ParseExpression(value).WithTriviaFrom(assignment.Right));
            else
            {
                var statement = SyntaxFactory.ParseStatement($"{control.Name}.{property} = {value};").WithLeadingTrivia(SyntaxFactory.Whitespace("        ")).WithTrailingTrivia(SyntaxFactory.EndOfLine("\n"));
                root = root.ReplaceNode(method, method.WithBody(method.Body!.AddStatements(statement)));
            }
        }
        return new { source = root.ToFullString(), name = control.Name };
    }
}
