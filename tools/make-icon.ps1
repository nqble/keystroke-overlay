# Generates icon-source.png (run `npx tauri icon assets/icon-source.png -o src-tauri/icons` afterwards).
param([string]$Out = "assets/icon-source.png")
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 1024,1024
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)
function RR($x,$y,$w,$h,$r){ $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x,$y,$r*2,$r*2,180,90); $p.AddArc($x+$w-$r*2,$y,$r*2,$r*2,270,90)
  $p.AddArc($x+$w-$r*2,$y+$h-$r*2,$r*2,$r*2,0,90); $p.AddArc($x,$y+$h-$r*2,$r*2,$r*2,90,90); $p.CloseFigure(); $p }
function B($r,$gg,$b){ New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,$r,$gg,$b)) }
$g.FillPath((B 24 28 38),(RR 40 40 944 944 200))
$g.FillPath((B 52 104 214),(RR 200 300 624 520 110))
$g.FillPath((B 79 140 255),(RR 200 200 624 520 110))
$f = New-Object System.Drawing.Font('Segoe UI',320,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$g.DrawString('K',$f,[System.Drawing.Brushes]::White,(New-Object System.Drawing.RectangleF 200,200,624,520),$sf)
$bmp.Save((Join-Path (Get-Location) $Out),[System.Drawing.Imaging.ImageFormat]::Png)
