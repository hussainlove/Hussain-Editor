using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

namespace HussainVideoEditorSetup
{
    public class SetupForm : Form
    {
        private TextBox txtInstallDir;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkLaunchAfter;
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnInstall;
        private Button btnCancel;

        public SetupForm()
        {
            this.Text = "Hussain Video Editor v1.0.0 - Windows 10/11 Setup Wizard";
            this.Size = new Size(560, 380);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(15, 23, 42);
            this.ForeColor = Color.White;

            Label lblTitle = new Label
            {
                Text = "Hussain Video Editor v1.0.0 Setup",
                Font = new Font("Segoe UI", 15, FontStyle.Bold),
                ForeColor = Color.FromArgb(56, 189, 248),
                Location = new Point(24, 20),
                AutoSize = true
            };

            Label lblSub = new Label
            {
                Text = "Install Hussain Video Editor + Auto-Import (.BAT) Engine on your PC.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(203, 213, 225),
                Location = new Point(26, 52),
                AutoSize = true
            };

            Label lblDir = new Label
            {
                Text = "Installation Folder:",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                Location = new Point(26, 92),
                AutoSize = true
            };

            string defaultDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                "Hussain Video Editor"
            );

            txtInstallDir = new TextBox
            {
                Text = defaultDir,
                Location = new Point(26, 116),
                Width = 410,
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            Button btnBrowse = new Button
            {
                Text = "Browse...",
                Location = new Point(446, 114),
                Width = 80,
                Height = 25,
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.SelectedPath = txtInstallDir.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallDir.Text = fbd.SelectedPath;
                    }
                }
            };

            chkDesktopShortcut = new CheckBox
            {
                Text = "Create Desktop Shortcuts (Hussain Video Editor + Auto-Import .BAT)",
                Checked = true,
                Location = new Point(26, 158),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };

            chkLaunchAfter = new CheckBox
            {
                Text = "Launch Hussain Video Editor when installation completes",
                Checked = true,
                Location = new Point(26, 186),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };

            lblStatus = new Label
            {
                Text = "Ready to install.",
                Location = new Point(26, 226),
                AutoSize = true,
                ForeColor = Color.FromArgb(148, 163, 184)
            };

            progressBar = new ProgressBar
            {
                Location = new Point(26, 250),
                Width = 500,
                Height = 20,
                Minimum = 0,
                Maximum = 100,
                Value = 0
            };

            btnInstall = new Button
            {
                Text = "Install Now",
                Location = new Point(320, 292),
                Width = 110,
                Height = 34,
                BackColor = Color.FromArgb(14, 165, 233),
                ForeColor = Color.Black,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat
            };
            btnInstall.Click += OnInstallClick;

            btnCancel = new Button
            {
                Text = "Close",
                Location = new Point(440, 292),
                Width = 86,
                Height = 34,
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnCancel.Click += (s, e) => this.Close();

            this.Controls.Add(lblTitle);
            this.Controls.Add(lblSub);
            this.Controls.Add(lblDir);
            this.Controls.Add(txtInstallDir);
            this.Controls.Add(btnBrowse);
            this.Controls.Add(chkDesktopShortcut);
            this.Controls.Add(chkLaunchAfter);
            this.Controls.Add(lblStatus);
            this.Controls.Add(progressBar);
            this.Controls.Add(btnInstall);
            this.Controls.Add(btnCancel);
        }

        private static void CopyDirectoryRecursive(string sourceDir, string targetDir)
        {
            Directory.CreateDirectory(targetDir);
            foreach (string file in Directory.GetFiles(sourceDir))
            {
                string destFile = Path.Combine(targetDir, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir))
            {
                string name = Path.GetFileName(subDir);
                if (name == "node_modules" || name == ".git" || name == "dist_installer")
                    continue;
                CopyDirectoryRecursive(subDir, Path.Combine(targetDir, name));
            }
        }

        private void OnInstallClick(object sender, EventArgs e)
        {
            try
            {
                btnInstall.Enabled = false;
                string targetDir = txtInstallDir.Text.Trim();
                lblStatus.Text = "Creating application directories...";
                progressBar.Value = 20;
                Application.DoEvents();

                Directory.CreateDirectory(targetDir);

                // Find project root relative to installer\dist_installer\
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                DirectoryInfo dir = new DirectoryInfo(exeDir);
                string sourceRoot = exeDir;
                for (int i = 0; i < 4 && dir != null; i++)
                {
                    if (File.Exists(Path.Combine(dir.FullName, "package.json")))
                    {
                        sourceRoot = dir.FullName;
                        break;
                    }
                    dir = dir.Parent;
                }

                lblStatus.Text = "Copying Hussain Video Editor files...";
                progressBar.Value = 55;
                Application.DoEvents();

                CopyDirectoryRecursive(sourceRoot, targetDir);

                string builtExe = Path.Combine(sourceRoot, "dist", "HussainVideoEditor", "HussainVideoEditor.exe");
                string targetExe = Path.Combine(targetDir, "HussainVideoEditor.exe");
                if (File.Exists(builtExe))
                {
                    File.Copy(builtExe, targetExe, true);
                }

                if (chkDesktopShortcut.Checked)
                {
                    lblStatus.Text = "Creating Desktop shortcuts...";
                    progressBar.Value = 80;
                    Application.DoEvents();

                    string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string batShortcut = Path.Combine(desktopDir, "Hussain Video Editor - Auto Import.bat");
                    File.WriteAllText(
                        batShortcut,
                        "@echo off\r\ncd /d \"" + targetDir + "\"\r\ncall \"" + Path.Combine(targetDir, "auto_import.bat") + "\" %*\r\n"
                    );
                }

                progressBar.Value = 100;
                lblStatus.Text = "Installation complete!";
                MessageBox.Show(
                    "Hussain Video Editor v1.0.0 has been installed to:\n" + targetDir,
                    "Installation Complete",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );

                if (chkLaunchAfter.Checked)
                {
                    if (File.Exists(targetExe))
                    {
                        Process.Start(new ProcessStartInfo { FileName = targetExe, WorkingDirectory = targetDir });
                    }
                    else if (File.Exists(Path.Combine(targetDir, "auto_import.bat")))
                    {
                        Process.Start(new ProcessStartInfo { FileName = Path.Combine(targetDir, "auto_import.bat"), WorkingDirectory = targetDir });
                    }
                }

                this.Close();
            }
            catch (Exception ex)
            {
                btnInstall.Enabled = true;
                MessageBox.Show("Installation error:\n" + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
