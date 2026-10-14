param([string]$scenario = 'seq', [int]$n = 1)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class K { [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); }
"@
function D($vk,$sc,$ext=0){ [K]::keybd_event($vk,$sc,$ext,[UIntPtr]::Zero) }
function U($vk,$sc,$ext=0){ [K]::keybd_event($vk,$sc,($ext -bor 2),[UIntPtr]::Zero) }
switch ($scenario) {
 'seq' {
   D 0x57 0x11; D 0x57 0x11; D 0x57 0x11; D 0x57 0x11; U 0x57 0x11        # W with 3 OS auto-repeats
   D 0xA3 0x1D 1; U 0xA3 0x1D 1                                            # Right Ctrl (extended)
   D 0x20 0x39; D 0x41 0x1E; U 0x20 0x39; U 0x41 0x1E                      # Space + A overlapping
   D 0x0D 0x1C 1; U 0x0D 0x1C 1                                            # Numpad Enter (extended)
   D 0x0D 0x1C; U 0x0D 0x1C                                                # main Enter
   U 0x2C 0x37 1                                                           # PrintScreen: release only
 }
 'flood' { for($i=0;$i -lt $n;$i++){ D 0xA3 0x1D 1; U 0xA3 0x1D 1 } }
 'hold'  { D 0xA3 0x1D 1 }
 'release' { U 0xA3 0x1D 1 }
}
