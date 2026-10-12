# Saves a PNG as a high-quality JPEG no larger than MaxSide pixels on its longest side
# (System.Drawing; nothing to install), for page images over the model's 5 MB image limit.
#   powershell -File scripts/to-jpeg.ps1 -In page.png -Out page.jpg -MaxSide 3000
param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$MaxSide = 3000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile((Resolve-Path $In).Path)
$scale = [Math]::Min(1.0, $MaxSide / [Math]::Max($img.Width, $img.Height))
$w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, $w, $h)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 90L
$bmp.Save($Out, $codec, $params)
$g.Dispose(); $bmp.Dispose(); $img.Dispose()
