# Saves what we need to see why a suite failed on a machine nobody can look at (GitHub's Windows runner): a screenshot,
# whether the test app is running, whether its overlay and debug ports answer, how WebView2 was started (its command
# line and listening ports, and any policy that turns off its developer tools), the WebView2 version and the test app's
# data folder (settings and a crash note, never keys: the app never writes keys anywhere, PRIVACY.md). Called by
# tests/e2e/run.mjs only when E2E_DIAGNOSTICS names a folder; .github/workflows/e2e.yml uploads that folder.
param([string]$suite, [string]$exeName, [string]$dataDir, [string]$outDir)
$ErrorActionPreference = 'Continue'
# UTF-8, so the report reads as plain text after download (Windows PowerShell writes UTF-16 by default)
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
$dir = Join-Path $outDir $suite
New-Item -ItemType Directory -Force $dir | Out-Null

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$screen = [System.Windows.Forms.SystemInformation]::VirtualScreen
$picture = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
[System.Drawing.Graphics]::FromImage($picture).CopyFromScreen($screen.Left, $screen.Top, 0, 0, $picture.Size)
$picture.Save((Join-Path $dir 'screen.png'))

$report = Join-Path $dir 'report.txt'
"== Test app process ($exeName)" | Out-File $report
Get-Process $exeName, msedgewebview2 -EA SilentlyContinue |
  Format-Table Name, Id, StartTime, MainWindowTitle -AutoSize | Out-String | Out-File $report -Append
"== Ports" | Out-File $report -Append
foreach ($url in 'http://127.0.0.1:7879/api/config', 'http://127.0.0.1:9222/json') {
  try { "$url -> " + (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3).StatusCode | Out-File $report -Append }
  catch { "$url -> no answer: $($_.Exception.Message)" | Out-File $report -Append }
}
"== WebView2 command lines (does --remote-debugging-port reach it?)" | Out-File $report -Append
$webviews = Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -EA SilentlyContinue
$webviews | Where-Object { $_.CommandLine -notmatch '--type=' } | ForEach-Object { "$($_.ProcessId): $($_.CommandLine)" } |
  Out-File $report -Append
"== Ports WebView2 listens on" | Out-File $report -Append
Get-NetTCPConnection -State Listen -OwningProcess @($webviews.ProcessId) -EA SilentlyContinue |
  Format-Table LocalAddress, LocalPort, OwningProcess -AutoSize | Out-String | Out-File $report -Append
"== Policies that can turn off WebView2's developer tools" | Out-File $report -Append
$policyKeys = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2',
  'HKCU:\SOFTWARE\Policies\Microsoft\Edge'
$policyKeys | ForEach-Object {
  $values = Get-ItemProperty $_ -EA SilentlyContinue
  if ($values) { "-- $_"; $values | Out-String } else { "-- ${_}: none" }
} | Out-File $report -Append
"== WebView2 runtime" | Out-File $report -Append
Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -EA SilentlyContinue |
  Select-Object -ExpandProperty pv | Out-File $report -Append
"== Data folder ($dataDir)" | Out-File $report -Append
Get-ChildItem $dataDir -Recurse -EA SilentlyContinue | Select-Object FullName, Length | Out-String | Out-File $report -Append
Get-ChildItem $dataDir -Filter *.txt -EA SilentlyContinue | ForEach-Object { "-- $($_.Name)"; Get-Content $_.FullName } |
  Out-File $report -Append
Get-Content $report
