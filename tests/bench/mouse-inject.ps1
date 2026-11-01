# Sends fake mouse input for the mouse trial (tests/bench/mouse-trial.mjs): relative moves at a steady rate, clicks of all five
# buttons, and wheel notches. It opens a small window of its own under the pointer first, so every click lands there and
# nowhere else, and moves the pointer only one pixel back and forth around that spot.
#   mouse-inject.ps1 move <seconds> <hz>      alternating one-pixel moves, <hz> per second (prints how many it sent)
#   mouse-inject.ps1 click <count>            <count> clicks, cycling left, right, middle, back, forward
#   mouse-inject.ps1 wheel <count>            <count> notches, up and down in turn
param([string]$mode = 'move', [double]$a = 10, [double]$b = 1000)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class FakeMouse {
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, flags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint ms);
  public static void Send(int dx, int dy, uint data, uint flags) {
    var inputs = new INPUT[1];
    inputs[0].type = 0;
    inputs[0].mi.dx = dx; inputs[0].mi.dy = dy; inputs[0].mi.mouseData = data; inputs[0].mi.flags = flags;
    SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@

$MOVE = 0x1; $WHEEL = 0x800
# down flag, up flag, extra data (which side button) for left, right, middle, back, forward
$buttons = @(@(0x2, 0x4, 0), @(0x8, 0x10, 0), @(0x20, 0x40, 0), @(0x80, 0x100, 1), @(0x80, 0x100, 2))

$form = New-Object System.Windows.Forms.Form
$form.Text = 'mouse trial'
$form.TopMost = $true
$form.StartPosition = 'CenterScreen'
$form.Width = 300
$form.Height = 200
$form.Show()
[System.Windows.Forms.Application]::DoEvents()
$center = [System.Drawing.Point]::new($form.Left + 150, $form.Top + 100)
[FakeMouse]::SetCursorPos($center.X, $center.Y) | Out-Null
Start-Sleep -Milliseconds 300
[FakeMouse]::timeBeginPeriod(1) | Out-Null

$sent = 0
if ($mode -eq 'move') {
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $interval = 1000.0 / $b
  $next = 0.0
  $direction = 1
  while ($stopwatch.Elapsed.TotalSeconds -lt $a) {
    if ($stopwatch.Elapsed.TotalMilliseconds -ge $next) {
      [FakeMouse]::Send($direction, 0, 0, $MOVE)
      $direction = -$direction
      $sent++
      $next += $interval
      if (($sent % 500) -eq 0) { [System.Windows.Forms.Application]::DoEvents() }
    }
  }
} elseif ($mode -eq 'click') {
  for ($i = 0; $i -lt $a; $i++) {
    $button = $buttons[$i % $buttons.Count]
    [FakeMouse]::Send(0, 0, $button[2], $button[0])
    Start-Sleep -Milliseconds 15
    [FakeMouse]::Send(0, 0, $button[2], $button[1])
    Start-Sleep -Milliseconds 15
    $sent += 2
    [System.Windows.Forms.Application]::DoEvents()
  }
} elseif ($mode -eq 'wheel') {
  for ($i = 0; $i -lt $a; $i++) {
    $turn = if (($i % 2) -eq 0) { 120 } else { -120 }
    [FakeMouse]::Send(0, 0, [BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$turn), 0), $WHEEL)
    Start-Sleep -Milliseconds 20
    $sent++
    [System.Windows.Forms.Application]::DoEvents()
  }
}
$form.Close()
Write-Output $sent
