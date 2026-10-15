# Generates icon-source.png (run `npx tauri icon assets/icon-source.png -o src-tauri/icons` afterwards).
#   -Devbuild   draws the official DEVBUILD logo instead: the same logo in black and purple (used by tools/devbuild.mjs)
param([string]$Out = "assets/icon-source.png", [switch]$Devbuild)
Add-Type -AssemblyName System.Drawing
# [background, key side, key top]
$colors = if ($Devbuild) { @(@(10, 8, 16), @(88, 44, 168), @(139, 92, 246)) } else { @(@(24, 28, 38), @(52, 104, 214), @(79, 140, 255)) }
$bmp = New-Object System.Drawing.Bitmap 1024,1024
$g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)
function RR($x,$y,$w,$h,$r){ $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x,$y,$r*2,$r*2,180,90); $p.AddArc($x+$w-$r*2,$y,$r*2,$r*2,270,90)
  $p.AddArc($x+$w-$r*2,$y+$h-$r*2,$r*2,$r*2,0,90); $p.AddArc($x,$y+$h-$r*2,$r*2,$r*2,90,90); $p.CloseFigure(); $p }
function B($c){ New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,$c[0],$c[1],$c[2])) }
$g.FillPath((B $colors[0]),(RR 40 40 944 944 200))
$g.FillPath((B $colors[1]),(RR 200 300 624 520 110))
$g.FillPath((B $colors[2]),(RR 200 200 624 520 110))
$f = New-Object System.Drawing.Font('Segoe UI',320,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$g.DrawString('K',$f,[System.Drawing.Brushes]::White,(New-Object System.Drawing.RectangleF 200,200,624,520),$sf)
$target = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path (Get-Location) $Out }
$bmp.Save($target,[System.Drawing.Imaging.ImageFormat]::Png)
