param([string]$name = 'kotest-e2e')
$p = Get-Process $name -EA SilentlyContinue | Select-Object -First 1
# Plain numbers in the invariant culture: "N0" would write 1,234 (which JavaScript reads as NaN once the app has used a
# second of CPU), and some cultures write a decimal comma.
$culture = [Globalization.CultureInfo]::InvariantCulture
[string]::Format($culture, '{0} {1} {2:F1} {3:F0}', $p.Threads.Count, $p.HandleCount, ($p.WorkingSet64 / 1MB),
  $p.TotalProcessorTime.TotalMilliseconds)
