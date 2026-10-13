// A.Y Scan launcher: a small windowed .exe (no console) that runs the PowerShell scripts in installer\ hidden,
// shows a progress window while the app starts, and shows any error as a message box.
// Written for the C# 5 compiler that ships with Windows (.NET Framework 4.x): no string interpolation, no ?. operator.
//   AYScan.exe              start the app and open the browser
//   AYScan.exe --no-browser start without opening the browser (used for auto-start at sign-in)
//   AYScan.exe --stop       stop the app and its database
//   AYScan.exe --backup     create a database backup now
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Launcher
{
    private const string Title = "A.Y Scan";

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string mode = args.Length > 0 ? args[0].ToLowerInvariant() : "";
        string script = "start.ps1";
        string extraArguments = "";
        string busyText = "جارٍ تشغيل A.Y Scan… قد يستغرق هذا دقيقة في أول مرة.";
        string doneText = null;

        if (mode == "--stop")
        {
            script = "stop.ps1";
            busyText = "جارٍ إيقاف A.Y Scan…";
            doneText = "تم إيقاف A.Y Scan. بياناتك محفوظة.";
        }
        else if (mode == "--backup")
        {
            script = "backup.ps1";
            busyText = "جارٍ إنشاء نسخة احتياطية…";
            doneText = "تم إنشاء النسخة الاحتياطية في مجلد backups.";
        }
        else if (mode == "--no-browser")
        {
            extraArguments = " -NoBrowser";
        }

        string scriptPath = Path.Combine(Path.Combine(appDir, "installer"), script);
        if (!File.Exists(scriptPath))
        {
            MessageBox.Show("File not found: " + scriptPath, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }

        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
        info.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + scriptPath + "\"" + extraArguments;
        info.WorkingDirectory = appDir;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;

        StringBuilder output = new StringBuilder();
        object outputLock = new object();
        Process process = new Process();
        process.StartInfo = info;
        process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (outputLock) { output.AppendLine(e.Data); } };
        process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) lock (outputLock) { output.AppendLine(e.Data); } };

        Form form = new Form();
        form.Text = Title;
        form.ClientSize = new Size(420, 96);
        form.StartPosition = FormStartPosition.CenterScreen;
        form.FormBorderStyle = FormBorderStyle.FixedDialog;
        form.ControlBox = false;
        form.TopMost = true;
        form.RightToLeft = RightToLeft.Yes;
        form.RightToLeftLayout = true;
        Label label = new Label();
        label.Text = busyText;
        label.AutoSize = false;
        label.SetBounds(16, 14, 388, 36);
        ProgressBar bar = new ProgressBar();
        bar.Style = ProgressBarStyle.Marquee;
        bar.MarqueeAnimationSpeed = 30;
        bar.SetBounds(16, 58, 388, 18);
        form.Controls.Add(label);
        form.Controls.Add(bar);

        // Poll instead of relying on the Exited event: it cannot be missed if the script finishes before the window is up.
        Timer timer = new Timer();
        timer.Interval = 300;
        timer.Tick += delegate { if (process.HasExited) { timer.Stop(); form.Close(); } };
        form.Shown += delegate { timer.Start(); };

        try
        {
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not run PowerShell: " + ex.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 3;
        }

        Application.Run(form);
        process.WaitForExit();
        int exitCode = process.ExitCode;

        string text;
        lock (outputLock) { text = output.ToString().Trim(); }
        if (exitCode != 0)
        {
            if (text.Length > 1500) text = text.Substring(text.Length - 1500);
            MessageBox.Show("تعذّر التنفيذ:\n\n" + text + "\n\nالسجلات: " + Path.Combine(appDir, "logs"),
                Title, MessageBoxButtons.OK, MessageBoxIcon.Error, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
        }
        else if (doneText != null)
        {
            MessageBox.Show(doneText, Title, MessageBoxButtons.OK, MessageBoxIcon.Information, MessageBoxDefaultButton.Button1, MessageBoxOptions.RtlReading | MessageBoxOptions.RightAlign);
        }
        return exitCode;
    }
}
