param([int]$presses = 120)
# Presses real keys (like inject.ps1) and prints when each key went DOWN, as milliseconds since 1970 on this PC's clock, so
# tests/bench/latency.mjs can compare it with when the app's local WebSocket delivered the same key. Three patterns, repeated:
#   single  a normal press (down, 30 ms, up)
#   fast    a very quick tap: up 5 to 30 ms after down
#   two     two keys 10 ms apart (A, then S)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }
"@
$clock = [Diagnostics.Stopwatch]::StartNew()
# wait without Start-Sleep, whose resolution is about 15 ms: spin on the stopwatch for exact short gaps
function Wait-Ms($ms) { $until = $clock.Elapsed.TotalMilliseconds + $ms; while ($clock.Elapsed.TotalMilliseconds -lt $until) { } }
function Epoch-Ms { ([DateTime]::UtcNow.Ticks - 621355968000000000) / 10000.0 }
function Down($vk, $scan) { $at = Epoch-Ms; [K]::keybd_event($vk, $scan, 0, [UIntPtr]::Zero); $at }
function Up($vk, $scan) { [K]::keybd_event($vk, $scan, 2, [UIntPtr]::Zero) }
$A = 0x41; $scanA = 0x1E; $S = 0x53; $scanS = 0x1F
$fastGaps = 5, 8, 12, 17, 22, 30
$lines = New-Object System.Collections.Generic.List[string]
for ($n = 0; $n -lt $presses; $n++) {
    switch ($n % 3) {
        0 { $at = Down $A $scanA; Wait-Ms 30; Up $A $scanA; $lines.Add("single KeyA $at") }
        1 { $at = Down $A $scanA; Wait-Ms $fastGaps[($n / 3) % $fastGaps.Count]; Up $A $scanA; $lines.Add("fast KeyA $at") }
        2 {
            $first = Down $A $scanA; Wait-Ms 10; $second = Down $S $scanS; Wait-Ms 20
            Up $A $scanA; Up $S $scanS
            $lines.Add("two KeyA $first"); $lines.Add("two KeyS $second")
        }
    }
    Wait-Ms 70   # let the key settle before the next press
}
$lines -join "`n"
