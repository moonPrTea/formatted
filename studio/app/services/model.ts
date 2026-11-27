export const fileNames = [
  'LoginForm.cs',
  'LoginForm.Designer.cs',
  'Program.cs',
] as const;
export type FileName = (typeof fileNames)[number];
export type Files = Record<FileName, string>;
export interface PackageReference {
  id: string;
  version: string;
}
export interface PackageResult extends PackageReference {
  iconUrl?: string;
  authors?: string;
  downloads?: number;
  description: string;
  versions: string[];
}
// Only hosted NuGet icons; never arbitrary third-party tracking URLs.
export function packageIconUrl(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^https:\/\/api\.nuget\.org\/v3-flatcontainer\/[a-z0-9_.-]+\/[a-z0-9_.+-]+\/icon$/i.test(
      value,
    )
    ? value
    : undefined;
}
export interface StudioProject {
  format: 'formatted-studio';
  version: 1;
  files: Files;
  packages?: PackageReference[];
}
export interface FormControl {
  name: string;
  type: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  backColor: string;
  foreColor: string;
  enabled: boolean;
  visible: boolean;
  checked: boolean;
  parent: string | null;
}
export interface FormModel {
  text: string;
  editable: boolean;
  warnings: string[];
  controls: FormControl[];
  width: number;
  height: number;
}
export interface Diagnostic {
  file: FileName;
  message: string;
  code: string;
  severity: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
export interface Analysis {
  diagnostics: Diagnostic[];
  form: FormModel;
}
export type DesignerEdit =
  | {kind: 'delete'; name: string}
  | {
      kind: 'geometry';
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {kind: 'property'; name: string; property: string; value: string | boolean}
  | {kind: 'rename'; name: string; newName: string}
  | {kind: 'add'; type: string};
export interface StudioRequest {
  operation: 'analyze' | 'complete' | 'edit' | 'compile';
  files: Files;
  file?: FileName;
  position?: number;
  edit?: DesignerEdit;
  packages?: PackageReference[];
}
export interface Completion {
  label: string;
  insertText: string;
  start: number;
  length: number;
  kind: string;
  detail: string;
}
export interface StudioApi {
  terminal(
    command: 'start' | 'write' | 'resize' | 'stop' | 'folder' | 'ack',
    value?: unknown,
  ): Promise<{cwd: string} | undefined>;
  onTerminal(callback: (event: {data: string; exited?: boolean}) => void): void;
  onCommand(callback: (command: string) => void): void;
  onOutput(callback: (text: string) => void): void;
  boot(): Promise<{project: StudioProject | null; service: boolean}>;
  query(request: StudioRequest): Promise<unknown>;
  checkpoint(project: StudioProject): Promise<void>;
  file(
    command: 'new' | 'open' | 'save' | 'export',
    project: StudioProject,
  ): Promise<{canceled?: boolean; project?: StudioProject; path?: string}>;
  close(project: StudioProject): Promise<void>;
  run(project: StudioProject): Promise<void>;
  stop(): Promise<void>;
  packages(
    command: 'search' | 'install',
    value: string | PackageReference,
  ): Promise<PackageResult[] | void>;
  onRunState(
    callback: (state: {running: boolean; message: string}) => void,
  ): void;
  onClose(callback: () => void): void;
}
export function readProject(value: unknown): StudioProject {
  if (!value || typeof value !== 'object')
    throw new Error('Некорректный проект Studio');
  const p = value as Partial<StudioProject>;
  if (p.format !== 'formatted-studio' || p.version !== 1 || !p.files)
    throw new Error('Неизвестный формат проекта Studio');
  const files = {} as Files;
  for (const name of fileNames) {
    if (typeof p.files[name] !== 'string' || p.files[name].length > 100_000)
      throw new Error(`Некорректный файл ${name}`);
    files[name] = p.files[name];
  }
  return {
    format: 'formatted-studio',
    version: 1,
    files,
    ...(p.packages ? {packages: readPackages(p.packages)} : {}),
  };
}
export function readPackages(value: unknown): PackageReference[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new Error('Некорректный список NuGet');
  const ids = new Set<string>();
  return value.map(p => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(p.id) ||
      typeof p.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(p.version) ||
      p.version.length > 80 ||
      ids.has(p.id.toLowerCase())
    )
      throw new Error('Некорректный пакет NuGet');
    ids.add(p.id.toLowerCase());
    return {id: p.id, version: p.version};
  });
}
export const initialProject: StudioProject = {
  format: 'formatted-studio',
  version: 1,
  files: {
    'LoginForm.cs': `using System;
using System.Windows.Forms;

namespace ChudoObuv;

public partial class LoginForm : Form
{
    public LoginForm()
    {
        InitializeComponent();
        buttonLogin.Click += buttonLogin_Click;
    }

    private void buttonLogin_Click(object? sender, EventArgs e)
    {
        var login = textBoxLogin.Text.Trim();
        if (string.IsNullOrWhiteSpace(login))
        {
            MessageBox.Show("Введите логин");
            return;
        }
    }
}
`,
    'LoginForm.Designer.cs': `using System.Drawing;
using System.Windows.Forms;

namespace ChudoObuv;

partial class LoginForm
{
    private Label labelHeading = null!;
    private Label labelLogin = null!;
    private TextBox textBoxLogin = null!;
    private Button buttonLogin = null!;

    private void InitializeComponent()
    {
        labelHeading = new Label();
        labelHeading.Text = "Вход в систему";
        labelHeading.Location = new Point(24, 24);
        labelHeading.Size = new Size(300, 30);
        Controls.Add(labelHeading);

        labelLogin = new Label();
        labelLogin.Text = "Логин";
        labelLogin.Location = new Point(24, 90);
        labelLogin.Size = new Size(200, 20);
        Controls.Add(labelLogin);

        textBoxLogin = new TextBox();
        textBoxLogin.Location = new Point(24, 116);
        textBoxLogin.Size = new Size(390, 28);
        Controls.Add(textBoxLogin);

        buttonLogin = new Button();
        buttonLogin.Text = "Войти";
        buttonLogin.Location = new Point(318, 170);
        buttonLogin.Size = new Size(96, 28);
        buttonLogin.BackColor = ColorTranslator.FromHtml("#70b2af");
        Controls.Add(buttonLogin);

        this.ClientSize = new Size(440, 300);
        this.Text = "Чудо Обувь — вход";
    }
}
`,
    'Program.cs': `using System;
using System.Windows.Forms;

namespace ChudoObuv;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new LoginForm());
    }
}
`,
  },
};
