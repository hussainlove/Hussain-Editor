using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace HussainVideoEditor
{
    static class Program
    {
        private const string AppUrl = "http://localhost:3000";

        private static bool IsServerOnline()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(AppUrl + "/api/system/info");
                req.Timeout = 1500;
                using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        private static string FindProjectRoot(string startDir)
        {
            DirectoryInfo dir = new DirectoryInfo(startDir);
            for (int i = 0; i < 4 && dir != null; i++)
            {
                if (File.Exists(Path.Combine(dir.FullName, "package.json")) &&
                    File.Exists(Path.Combine(dir.FullName, "server.ts")))
                {
                    return dir.FullName;
                }
                dir = dir.Parent;
            }
            return startDir;
        }

        private static void LaunchAppWindow(string url)
        {
            // Prefer native Edge or Chrome --app mode for a clean desktop studio window
            string[] browserPaths = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
            };

            foreach (string browser in browserPaths)
            {
                if (File.Exists(browser))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = browser,
                        Arguments = "--app=" + url + " --window-size=1440,900",
                        UseShellExecute = true
                    });
                    return;
                }
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }

        [STAThread]
        static void Main(string[] args)
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string rootDir = FindProjectRoot(exeDir);

            // Add bundled ffmpeg\bin to PATH if present
            string ffmpegBin = Path.Combine(rootDir, "ffmpeg", "bin");
            if (Directory.Exists(ffmpegBin))
            {
                string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
                Environment.SetEnvironmentVariable("PATH", ffmpegBin + ";" + currentPath);
            }

            if (!IsServerOnline())
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npm run dev",
                    WorkingDirectory = rootDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                try
                {
                    Process.Start(psi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Failed to start Hussain Video Editor engine:\n" + ex.Message +
                        "\n\nPlease verify Node.js is installed and run 'npm install' in:\n" + rootDir,
                        "Hussain Video Editor v1.0.0",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // Wait up to 30 seconds for backend server to come online
                for (int i = 0; i < 30; i++)
                {
                    Thread.Sleep(1000);
                    if (IsServerOnline())
                    {
                        break;
                    }
                }
            }

            LaunchAppWindow(AppUrl);
        }
    }
}
