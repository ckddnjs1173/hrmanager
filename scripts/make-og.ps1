# Generate OG default image (1200x630 PNG) via .NET System.Drawing (no runtime dependency).
# Korean strings are read from og-strings.txt as UTF-8 to avoid PS 5.1 script-encoding issues.
# Run: powershell -NoProfile -File scripts/make-og.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path $PSScriptRoot -Parent
$S = [System.IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'og-strings.txt'), [System.Text.Encoding]::UTF8)

$W = 1200; $H = 630
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$fmt = [System.Drawing.StringFormat]::GenericTypographic

$rect = New-Object System.Drawing.Rectangle(0, 0, $W, $H)
$c1 = [System.Drawing.Color]::FromArgb(241, 246, 255)
$c2 = [System.Drawing.Color]::FromArgb(255, 255, 255)
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 90)
$g.FillRectangle($bg, $rect)

$blue = [System.Drawing.Color]::FromArgb(47, 109, 246)
$brBlue = New-Object System.Drawing.SolidBrush($blue)
$brDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(11, 13, 18))
$brSub = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(75, 85, 99))
$brGray = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(138, 144, 153))
$brWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)

$g.FillRectangle($brBlue, 0, 0, $W, 12)

function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r, $r, 180, 90)
  $p.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
  $p.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
  $p.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
  $p.CloseFigure()
  return $p
}
$g.FillPath($brBlue, (RoundRect 84 70 52 52 16))
$g.FillPath($brWhite, (RoundRect 95 84 30 22 8))
$g.FillEllipse($brBlue, 101, 92, 6, 6)
$g.FillEllipse($brBlue, 110, 92, 6, 6)
$g.FillEllipse($brBlue, 119, 92, 6, 6)

$fName = "Malgun Gothic"
$B = [System.Drawing.FontStyle]::Bold
$fLogo = New-Object System.Drawing.Font($fName, 23, $B)
$fLogoSub = New-Object System.Drawing.Font($fName, 13, $B)
$fH = New-Object System.Drawing.Font($fName, 50, $B)
$fD = New-Object System.Drawing.Font($fName, 20)
$fF = New-Object System.Drawing.Font($fName, 16, $B)

function DrawSeg($text, $font, $brush, $x, $y) {
  $g.DrawString($text, $font, $brush, [single]$x, [single]$y, $fmt)
  return $g.MeasureString($text, $font, 10000, $fmt).Width
}

$lx = 150; $ly = 80
$w1 = DrawSeg $S[0] $fLogo $brDark $lx $ly
$w2 = DrawSeg $S[1] $fLogo $brBlue ($lx + $w1) $ly
[void](DrawSeg $S[2] $fLogoSub $brGray ($lx + $w1 + $w2 + 10) ($ly + 9))

[void](DrawSeg $S[3] $fH $brDark 80 165)
$hw = DrawSeg $S[4] $fH $brBlue 80 250
[void](DrawSeg $S[5] $fH $brDark (80 + $hw) 250)

[void](DrawSeg $S[6] $fD $brSub 82 352)
[void](DrawSeg $S[7] $fF $brBlue 84 476)

$g.Dispose()
$out = Join-Path $root "assets\brand\og-default.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("OG PNG saved: " + $out)
