$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$folder=Join-Path $PSScriptRoot '..\build'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$bitmap=New-Object Drawing.Bitmap 256,256
$graphics=[Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::Transparent)
$image=[Drawing.Image]::FromFile((Join-Path $PSScriptRoot '..\public\brand\logo-transparent.png'))
# Convert the supplied emblem to the native Windows icon container.
$graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.DrawImage($image,(New-Object Drawing.Rectangle 10,10,236,236),(New-Object Drawing.Rectangle 50,40,680,610),[Drawing.GraphicsUnit]::Pixel)
$image.Dispose()
$icon=[Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream=[IO.File]::Create((Join-Path $folder 'icon.ico'))
$icon.Save($stream)
$stream.Dispose();$icon.Dispose();$graphics.Dispose();$bitmap.Dispose()
