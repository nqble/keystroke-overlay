param([string]$name = 'kotest-e2e')
$p = Get-Process $name -EA SilentlyContinue | Select-Object -First 1
"{0} {1} {2:N1} {3:N0}" -f $p.Threads.Count, $p.HandleCount, ($p.WorkingSet64/1MB), $p.TotalProcessorTime.TotalMilliseconds
