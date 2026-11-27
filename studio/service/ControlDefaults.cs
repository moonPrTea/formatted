namespace FormattedStudioInternal;

// Logical (96-DPI) sizes, shared by the designer and the teaching runtime.
internal static class ControlDefaults
{
    internal static (int Width, int Height) Size(string type) => type switch
    {
        "Button" => (75, 23),
        "CheckBox" or "RadioButton" => (104, 24),
        "ComboBox" => (121, 23),
        "ListBox" => (120, 96),
        "Panel" or "GroupBox" => (200, 100),
        "PictureBox" => (100, 50),
        "DataGridView" => (240, 150),
        "Form" => (440, 300),
        _ => (100, 23)
    };
    internal static string Background(string type) => type switch
    {
        "TextBox" or "ComboBox" or "ListBox" => "#ffffff",
        "DataGridView" => "#ababab",
        _ => "#f0f0f0"
    };
    internal static string Text(string type, string name) =>
        type is "Button" or "Label" or "CheckBox" or "RadioButton" or "GroupBox" ? name : "";
}
