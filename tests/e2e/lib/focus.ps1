# Sets who has keyboard focus.
#   -to app   : bring the test app's settings window to the front (it normally already is: a new window takes focus)
#   -to away  : minimize it, so another program (whatever was behind) gets the focus
# Prints whether the wanted state is really true.
param([string]$to = 'app')
Add-Type @"
using System; using System.Runtime.InteropServices;
public class F {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@
$h = (Get-Process kotest-e2e | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1).MainWindowHandle
if ($to -eq 'app') { [F]::ShowWindow($h, 9) | Out-Null; [F]::SwitchToThisWindow($h, $true); [F]::SetForegroundWindow($h) | Out-Null }
else { [F]::ShowWindow($h, 6) | Out-Null }
Start-Sleep -Milliseconds 700
$front = ([F]::GetForegroundWindow() -eq $h)
"foreground-is-$to : " + $(if ($to -eq 'app') { $front } else { -not $front })
