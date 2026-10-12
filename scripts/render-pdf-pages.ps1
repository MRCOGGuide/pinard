# Renders chosen pages of a PDF to PNG with Windows' own PDF engine (Windows.Data.Pdf),
# turning each page upright by the given quarter-turns. Nothing to install.
#
#   powershell -File scripts/render-pdf-pages.ps1 -Pdf in.pdf -OutDir dir -Pages "33:1,34:0" -Width 2400
#
# Pages are "page:quarterTurnsClockwise" pairs, 1-based. Writes <OutDir>\p<page>.png.
param(
  [Parameter(Mandatory = $true)][string]$Pdf,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [Parameter(Mandatory = $true)][string]$Pages,
  [int]$Width = 2400
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Drawing
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTask = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskAction = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(); $task.Result }
function AwaitAction($op) { $task = $asTaskAction.Invoke($null, @($op)); $task.Wait() }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path $Pdf).Path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync((Resolve-Path $OutDir).Path)) ([Windows.Storage.StorageFolder])
foreach ($pair in $Pages.Split(',')) {
  $bits = $pair.Split(':')
  $n = [int]$bits[0]; $turns = [int]$bits[1]
  if ($n -lt 1 -or $n -gt $doc.PageCount) { continue }
  $page = $doc.GetPage($n - 1)
  $opts = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  if ($page.Size.Width -gt $page.Size.Height) { $opts.DestinationHeight = $Width } else { $opts.DestinationWidth = $Width }
  $tmpName = "p$n.raw.png"
  $out = Await ($folder.CreateFileAsync($tmpName, [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $stream = Await ($out.OpenAsync([Windows.Storage.FileAccessMode]::ReadWrite)) ([Windows.Storage.Streams.IRandomAccessStream])
  AwaitAction ($page.RenderToStreamAsync($stream, $opts))
  $stream.Dispose()
  $raw = Join-Path $OutDir $tmpName
  $img = [System.Drawing.Image]::FromFile($raw)
  switch ($turns % 4) {
    1 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
    2 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
    3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
  }
  $img.Save((Join-Path $OutDir "p$n.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose()
  Remove-Item $raw
  Write-Output "p$n"
}
