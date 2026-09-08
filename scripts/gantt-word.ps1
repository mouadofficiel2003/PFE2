# High-resolution Gantt PNG for a Word report.
Add-Type -AssemblyName System.Drawing

function Get-Days([datetime]$a, [datetime]$b) {
  return ($b - $a).TotalDays
}

$axisStart = [datetime]"2026-03-06"
$axisEnd = [datetime]"2026-06-06"
$totalDays = Get-Days $axisStart $axisEnd

$width = 2400
$marginL = 620
$marginR = 50
$marginT = 160
$chartW = $width - $marginL - $marginR
$rowH = 195
$barH = 80
$chartBottom = $marginT + (4 * $rowH) - 24
$height = [int]($chartBottom + 48)

$bmp = New-Object System.Drawing.Bitmap $width, $height
$bmp.SetResolution(300, 300)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.Color]::White)

$fontTitle = New-Object System.Drawing.Font "Calibri", 22, ([System.Drawing.FontStyle]::Bold)
$fontSub = New-Object System.Drawing.Font "Calibri", 12
$fontMonth = New-Object System.Drawing.Font "Calibri", 13, ([System.Drawing.FontStyle]::Bold)
$fontTask = New-Object System.Drawing.Font "Calibri", 14, ([System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font "Calibri", 11
$brushText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(44, 44, 44))
$brushMuted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(102, 102, 102))
$penGrid = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 220, 220)), 2
$penAxis = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 90, 90)), 2

$title = "Diagramme de Gantt du projet"
$titleSize = $g.MeasureString($title, $fontTitle)
$g.DrawString($title, $fontTitle, $brushText, ($width - $titleSize.Width) / 2, 28)
$sub = "Stage du 6 mars au 6 juin 2026"
$subSize = $g.MeasureString($sub, $fontSub)
$g.DrawString($sub, $fontSub, $brushMuted, ($width - $subSize.Width) / 2, 88)

$months = @(
  @{ Name = "Mars"; Start = [datetime]"2026-03-06"; End = [datetime]"2026-04-01" },
  @{ Name = "Avril"; Start = [datetime]"2026-04-01"; End = [datetime]"2026-05-01" },
  @{ Name = "Mai"; Start = [datetime]"2026-05-01"; End = [datetime]"2026-06-01" },
  @{ Name = "Juin"; Start = [datetime]"2026-06-01"; End = [datetime]"2026-06-06" }
)

foreach ($m in $months) {
  $x1 = [float]($marginL + $chartW * ((Get-Days $axisStart $m.Start) / $totalDays))
  $x2 = [float]($marginL + $chartW * ((Get-Days $axisStart $m.End) / $totalDays))
  $g.DrawLine($penGrid, $x1, $marginT - 36, $x1, $chartBottom)
  $labelW = $g.MeasureString($m.Name, $fontMonth)
  $g.DrawString($m.Name, $fontMonth, $brushText, $x1 + (($x2 - $x1) - $labelW.Width) / 2, $marginT - 42)
}

$g.DrawLine($penAxis, $marginL, $marginT - 8, $marginL + $chartW, $marginT - 8)
$g.DrawLine($penAxis, $marginL, $chartBottom, $marginL + $chartW, $chartBottom)
$g.DrawLine($penAxis, $marginL, $marginT - 8, $marginL, $chartBottom)
$g.DrawLine($penAxis, $marginL + $chartW, $marginT - 8, $marginL + $chartW, $chartBottom)

$eAcute = [char]0x00E9
$tasks = @(
  @{ Name = "Cahier des charges"; Start = [datetime]"2026-03-06"; End = [datetime]"2026-03-20"; Color = [System.Drawing.Color]::FromArgb(196, 165, 116); Dates = "6 mars - 19 mars" },
  @{ Name = "Conception UML"; Start = [datetime]"2026-03-20"; End = [datetime]"2026-04-20"; Color = [System.Drawing.Color]::FromArgb(91, 155, 213); Dates = "20 mars - 19 avril" },
  @{ Name = ("R" + $eAcute + "alisation"); Start = [datetime]"2026-04-20"; End = [datetime]"2026-05-25"; Color = [System.Drawing.Color]::FromArgb(112, 173, 71); Dates = "20 avril - 24 mai" },
  @{ Name = "Tests"; Start = [datetime]"2026-05-25"; End = [datetime]"2026-06-07"; Color = [System.Drawing.Color]::FromArgb(237, 125, 49); Dates = "25 mai - 6 juin" }
)

for ($i = 0; $i -lt $tasks.Count; $i++) {
  $t = $tasks[$i]
  $y = [float]($marginT + ($i * $rowH) + 42)
  $x1 = [float]($marginL + $chartW * ((Get-Days $axisStart $t.Start) / $totalDays))
  $x2 = [float]($marginL + $chartW * ((Get-Days $axisStart $t.End) / $totalDays))
  if ($x2 - $x1 -lt 16) { $x2 = $x1 + 16 }

  $g.DrawString($t.Name, $fontTask, $brushText, 28, $y + 8)
  $g.DrawString($t.Dates, $fontSmall, $brushMuted, 28, $y + 48)

  $brushBar = New-Object System.Drawing.SolidBrush $t.Color
  $g.FillRectangle($brushBar, $x1, $y, ($x2 - $x1), $barH)
  $g.DrawRectangle((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 80, 80)), 1.5), $x1, $y, ($x2 - $x1), $barH)
  $brushBar.Dispose()
}

$out = Join-Path (Split-Path $PSScriptRoot -Parent) "diagramme-gantt.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$fontTitle.Dispose()
$fontSub.Dispose()
$fontMonth.Dispose()
$fontTask.Dispose()
$fontSmall.Dispose()
$brushText.Dispose()
$brushMuted.Dispose()
Write-Host "Wrote $out"
