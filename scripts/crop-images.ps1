# Crops regions out of page images (System.Drawing; nothing to install).
#   powershell -File scripts/crop-images.ps1 -Spec crops.json
# crops.json: [{ "in": "p33.png", "out": "aid-1.png", "box": [x0, y0, x1, y1] }], box as fractions of width and height.
param([Parameter(Mandatory = $true)][string]$Spec)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$items = Get-Content -Raw -Path $Spec | ConvertFrom-Json
foreach ($c in $items) {
  $src = [System.Drawing.Bitmap]::FromFile($c.in)
  $x0 = [Math]::Max(0, [int]([double]$c.box[0] * $src.Width))
  $y0 = [Math]::Max(0, [int]([double]$c.box[1] * $src.Height))
  $x1 = [Math]::Min($src.Width, [int]([double]$c.box[2] * $src.Width))
  $y1 = [Math]::Min($src.Height, [int]([double]$c.box[3] * $src.Height))
  if ($x1 - $x0 -lt 20 -or $y1 - $y0 -lt 20) { $x0 = 0; $y0 = 0; $x1 = $src.Width; $y1 = $src.Height }
  $rect = New-Object System.Drawing.Rectangle $x0, $y0, ($x1 - $x0), ($y1 - $y0)
  $crop = $src.Clone($rect, $src.PixelFormat)
  $crop.Save($c.out, [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose(); $src.Dispose()
  Write-Output $c.out
}
