# Prints "<processCount> <privateMB> <workingSetMB>" for the test app and every process it started (the WebView2 helpers).
param([string]$name = 'kotest-e2e')
$root = Get-Process $name -EA SilentlyContinue | Select-Object -First 1
if (-not $root) { '0 0 0'; exit }
$all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
$ids = [System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add($root.Id)
do { $n = $ids.Count; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } } while ($ids.Count -gt $n)
$priv = 0; $ws = 0; $c = 0
foreach ($i in $ids) { $q = Get-Process -Id $i -EA SilentlyContinue; if ($q) { $c++; $priv += $q.PrivateMemorySize64; $ws += $q.WorkingSet64 } }
'{0} {1:N1} {2:N1}' -f $c, ($priv / 1MB), ($ws / 1MB)
