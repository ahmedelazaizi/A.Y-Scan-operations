[CmdletBinding()]
param(
    [switch]$SelfTest,
    [string]$InstallationId
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Get-SigningPrerequisites {
    $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { throw 'لم يتم العثور على Node.js. ثبّت Node.js 20.19 أو أحدث على جهاز المطوّر.' }
    $tsxPath = Join-Path $ProjectRoot 'node_modules\tsx\dist\cli.mjs'
    if (-not (Test-Path -LiteralPath $tsxPath -PathType Leaf)) { throw 'اعتماديات المشروع غير موجودة. شغّل pnpm install --frozen-lockfile في المستودع أولًا.' }
    $cliPath = Join-Path $PSScriptRoot 'trial-license.ts'
    if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) { throw 'أداة التوقيع tools/trial-license.ts غير موجودة. شغّل هذه الأداة من مستودع المطوّر.' }
    $privatePath = Join-Path $env:USERPROFILE '.ay-scan\trial-private.pem'
    if (-not (Test-Path -LiteralPath $privatePath -PathType Leaf)) { throw 'المفتاح الخاص الموجود مطلوب في ~/.ay-scan/trial-private.pem. لن تنشئ هذه الأداة مفاتيح أو تستبدلها.' }
    return @{ Node = $nodeCommand.Source; Tsx = $tsxPath; Cli = $cliPath }
}

function Get-FullActivationCode([string]$DeviceId) {
    $DeviceId = $DeviceId.Trim()
    if ($DeviceId -cnotmatch '^AYSCAN-HW2-[0-9A-F]{64}$') { throw 'أدخل معرّف جهاز الخادم كاملًا: AYSCAN-HW2- ثم 64 حرفًا من 0-9 وA-F بأحرف كبيرة. انسخه من إعدادات العميل.' }
    $signing = Get-SigningPrerequisites
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $signing.Node
    # Windows filenames cannot contain quotes; the device ID is strictly validated above.
    $start.Arguments = '"{0}" "{1}" issue --installation-id {2}' -f $signing.Tsx, $signing.Cli, $DeviceId
    $start.WorkingDirectory = $ProjectRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $signer = New-Object System.Diagnostics.Process
    $signer.StartInfo = $start
    try {
        [void]$signer.Start()
        $stdout = $signer.StandardOutput.ReadToEndAsync()
        $stderr = $signer.StandardError.ReadToEndAsync()
        if (-not $signer.WaitForExit(30000)) { $signer.Kill(); $signer.WaitForExit(); throw 'انتهت مهلة التوقيع. تحقق من Node واعتماديات المشروع ثم أعد المحاولة.' }
        $activationCode = $stdout.GetAwaiter().GetResult().Trim()
        [void]$stderr.GetAwaiter().GetResult()
        if ($signer.ExitCode -ne 0) { throw ('فشل CLI في التوقيع (exit code: {0}). تحقق من صلاحية المفتاح الخاص الموجود واعتماديات المشروع. لم يتم تغيير المفاتيح.' -f $signer.ExitCode) }
        if ($activationCode -cnotmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$') { throw 'لم يُرجع CLI رمز Ed25519 بالصيغة المتوقعة. راجع إصدار المشروع.' }
        return $activationCode
    } finally { $signer.Dispose() }
}

function Test-SigningPath {
    if (-not $InstallationId) { throw 'SelfTest يحتاج -InstallationId بمعرّف جهاز الخادم. لا تُنشئ هذه الأداة معرّفًا ثابتًا.' }
    $activationCode = Get-FullActivationCode $InstallationId
    $payload = $activationCode.Split('.')[0].Replace('-', '+').Replace('_', '/')
    $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), '=')
    $license = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
    if ($license.version -ne 2 -or $license.edition -cne 'full' -or $license.installationId -cne $InstallationId.Trim() -or $license.PSObject.Properties.Name -contains 'recordLimit') { throw 'محتوى الرمز لا يطابق ترخيص النسخة الكاملة v2.' }
    Write-Output 'SelfTest passed: existing CLI produced a hardware-bound full v2 token; no token file or key was written.'
}

if ($SelfTest) {
    try { Test-SigningPath; exit 0 } catch { Write-Error $_.Exception.Message -ErrorAction Continue; exit 1 }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

function New-ToolLabel([string]$Text) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Text
    $label.Dock = 'Fill'
    $label.AutoSize = $true
    $label.Margin = New-Object System.Windows.Forms.Padding(8)
    return $label
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'A.Y Scan — أداة تفعيل المطوّر'
$form.Size = New-Object System.Drawing.Size(800, 640)
$form.MinimumSize = New-Object System.Drawing.Size(620, 540)
$form.StartPosition = 'CenterScreen'
$form.RightToLeft = 'Yes'
$form.RightToLeftLayout = $true
$form.Font = New-Object System.Drawing.Font('Segoe UI', 11)

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'
$layout.Padding = New-Object System.Windows.Forms.Padding(16)
$layout.ColumnCount = 1
$layout.RowCount = 8
foreach ($height in @(54, 32, 70, 44, 32, 0, 44, 66)) {
    $row = New-Object System.Windows.Forms.RowStyle
    if ($height -eq 0) { $row.SizeType = 'Percent'; $row.Height = 100 } else { $row.SizeType = 'Absolute'; $row.Height = $height }
    [void]$layout.RowStyles.Add($row)
}
$form.Controls.Add($layout)
$layout.Controls.Add((New-ToolLabel 'للمطوّر فقط: إصدار رمز النسخة الكاملة لجهاز الخادم بالمفتاح الخاص الموجود. لا تُرسل الأداة أو المفتاح إلى العميل.'), 0, 0)
$layout.Controls.Add((New-ToolLabel 'معرّف جهاز الخادم (من إعدادات العميل)'), 0, 1)

$deviceInput = New-Object System.Windows.Forms.TextBox
$deviceInput.Dock = 'Fill'
$deviceInput.Multiline = $true
$deviceInput.RightToLeft = 'No'
$deviceInput.ScrollBars = 'Vertical'
$deviceInput.AccessibleName = 'معرّف جهاز الخادم'
$deviceInput.Text = $InstallationId
$layout.Controls.Add($deviceInput, 0, 2)

$generateButton = New-Object System.Windows.Forms.Button
$generateButton.Text = 'إنشاء رمز النسخة الكاملة'
$generateButton.Dock = 'Fill'
$layout.Controls.Add($generateButton, 0, 3)
$layout.Controls.Add((New-ToolLabel 'رمز التفعيل الكامل'), 0, 4)

$codeOutput = New-Object System.Windows.Forms.TextBox
$codeOutput.Dock = 'Fill'
$codeOutput.Multiline = $true
$codeOutput.ReadOnly = $true
$codeOutput.RightToLeft = 'No'
$codeOutput.ScrollBars = 'Vertical'
$codeOutput.AccessibleName = 'رمز التفعيل الكامل — للقراءة فقط'
$layout.Controls.Add($codeOutput, 0, 5)

$copyButton = New-Object System.Windows.Forms.Button
$copyButton.Text = 'نسخ الرمز'
$copyButton.Dock = 'Fill'
$copyButton.Enabled = $false
$layout.Controls.Add($copyButton, 0, 6)
$statusLabel = New-ToolLabel 'الصق المعرّف ثم أنشئ الرمز. لا تحتاج الأداة إلى اتصال بالشبكة.'
$statusLabel.AccessibleName = 'حالة التوليد والنسخ'
$layout.Controls.Add($statusLabel, 0, 7)

$deviceInput.Add_TextChanged({ $codeOutput.Clear(); $copyButton.Enabled = $false; $statusLabel.Text = 'تغيّر المعرّف؛ أنشئ رمزًا جديدًا لهذا الجهاز.' })
$generateButton.Add_Click({
    $generateButton.Enabled = $false
    $deviceInput.Enabled = $false
    $copyButton.Enabled = $false
    $codeOutput.Clear()
    $statusLabel.Text = 'جارٍ إنشاء الرمز…'
    $form.UseWaitCursor = $true
    $form.Refresh()
    try {
        $codeOutput.Text = Get-FullActivationCode $deviceInput.Text
        $copyButton.Enabled = $true
        $statusLabel.Text = 'تم إنشاء رمز النسخة الكاملة. أرسله إلى المدير لإدخاله في إعدادات العميل.'
    } catch { $statusLabel.Text = $_.Exception.Message }
    finally { $generateButton.Enabled = $true; $deviceInput.Enabled = $true; $form.UseWaitCursor = $false }
})
$copyButton.Add_Click({
    try { [System.Windows.Forms.Clipboard]::SetText($codeOutput.Text); $statusLabel.Text = 'تم نسخ رمز التفعيل.' }
    catch { $codeOutput.Focus(); $codeOutput.SelectAll(); $statusLabel.Text = 'تعذر النسخ. تم تحديد الرمز؛ انسخه يدويًا باستخدام Ctrl+C.' }
})
try { [void](Get-SigningPrerequisites) } catch { $statusLabel.Text = $_.Exception.Message }
try { [void]$form.ShowDialog() } finally { $form.Dispose() }
