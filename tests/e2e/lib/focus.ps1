# Sets who has keyboard focus.
#   -to app   : bring the test app's settings window to the front (it normally already is: a new window takes focus)
#   -to away  : minimize it, so another program gets the focus. Windows gives it to the window behind, but when no
#               other window can take it (often after earlier suites closed theirs) the minimized window stays in
#               front, so the taskbar, which is always there, is given the focus instead.
# Prints whether the wanted state is really true.
param([string]$to = 'app')
Add-Type @"
using System; using System.Runtime.InteropServices;
public class F {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string name);
}
"@
$h = (Get-Process kotest-e2e | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
if ($to -eq 'app') { [F]::ShowWindow($h, 9) | Out-Null; [F]::SwitchToThisWindow($h, $true); [F]::SetForegroundWindow($h) | Out-Null }
else {
  [F]::ShowWindow($h, 6) | Out-Null
  Start-Sleep -Milliseconds 300
  if ([F]::GetForegroundWindow() -eq $h) { [F]::SwitchToThisWindow([F]::FindWindow('Shell_TrayWnd', $null), $true) }
}
Start-Sleep -Milliseconds 700
$front = ([F]::GetForegroundWindow() -eq $h)
"foreground-is-$to : " + $(if ($to -eq 'app') { $front } else { -not $front })
