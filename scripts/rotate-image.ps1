# Turns an image in place by quarter-turns clockwise (System.Drawing; nothing to install).
#   powershell -File scripts/rotate-image.ps1 -Path page.png -Turns 1
param([Parameter(Mandatory = $true)][string]$Path, [Parameter(Mandatory = $true)][int]$Turns)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$full = (Resolve-Path $Path).Path
$img = [System.Drawing.Image]::FromFile($full)
$copy = New-Object System.Drawing.Bitmap $img
$img.Dispose()
switch ($Turns % 4) {
  1 { $copy.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
  2 { $copy.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
  3 { $copy.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
}
$copy.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
$copy.Dispose()
