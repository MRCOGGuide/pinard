# Makes web-sized JPEG copies (at most MaxSide px on the longest side, quality 82) of many
# images in one go (System.Drawing; nothing to install).
#   powershell -File scripts/web-images.ps1 -Spec list.json -MaxSide 1600
# list.json: [{ "in": "aid-1-1.png", "out": "aid-1-1.web.jpg" }]
param([Parameter(Mandatory = $true)][string]$Spec, [int]$MaxSide = 1600)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
foreach ($c in (Get-Content -Raw -Path $Spec | ConvertFrom-Json)) {
  try {
    $img = [System.Drawing.Image]::FromFile((Resolve-Path $c.in).Path)
    $scale = [Math]::Min(1.0, $MaxSide / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $bmp.Save($c.out, $codec, $params)
    $g.Dispose(); $bmp.Dispose(); $img.Dispose()
    Write-Output $c.out
  } catch {
    Write-Output "FAILED $($c.in): $($_.Exception.Message)"
  }
}
