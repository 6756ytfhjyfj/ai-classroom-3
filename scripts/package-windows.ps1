$ErrorActionPreference='Stop'
function Get-Sha256([string]$targetFile) {
  $hasher=[Security.Cryptography.SHA256]::Create()
  $hashStream=[IO.File]::OpenRead($targetFile)
  try { return [BitConverter]::ToString($hasher.ComputeHash($hashStream)).Replace('-','').ToLowerInvariant() }
  finally { $hashStream.Dispose(); $hasher.Dispose() }
}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repo
$env:ELECTRON_BUILDER_CACHE=Join-Path $repo '..\builder-cache'
$env:ELECTRON_CACHE=Join-Path $repo '..\electron-cache'
$env:TEMP=Join-Path $repo '..\temp'
$env:TMP=$env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
& (Join-Path $PSScriptRoot 'create-icon.ps1')
node scripts/stage-desktop.mjs
if($LASTEXITCODE -ne 0){throw 'Desktop staging failed'}
$runtime=Join-Path $repo '..\electron-runtime'
if(Test-Path -LiteralPath (Join-Path $runtime 'electron.exe')){ & node_modules/.bin/electron-builder.cmd --win dir --x64 ('--config.electronDist='+$runtime) }else{ & node_modules/.bin/electron-builder.cmd --win dir --x64 }
if($LASTEXITCODE -ne 0){throw 'Electron packaging failed'}
$f='C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$refs=@('System.dll','System.Core.dll','System.Xaml.dll','System.Windows.Forms.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll','WPF\PresentationFramework.dll','WPF\PresentationCore.dll','WPF\WindowsBase.dll') | ForEach-Object { '/r:'+(Join-Path $f $_) }
$generated=Join-Path $repo 'installer\generated'
New-Item -ItemType Directory -Force -Path $generated | Out-Null
$info=Join-Path $generated 'PayloadInfo.cs'
$website='https://onclasstime.vercel.app'
[IO.File]::WriteAllText($info,('public static class PayloadInfo { public const string Hash=""; public const string Website="'+$website+'"; }'))
$source=Join-Path $repo 'installer\Setup.cs'
$brand='/resource:'+(Join-Path $repo 'public\brand\logo.wpf.xaml')+',brand.xaml'
$icon='/win32icon:'+(Join-Path $repo 'build\icon.ico')
$manifest='/win32manifest:'+(Join-Path $repo 'installer\app.manifest')
$uninstall=Join-Path $repo 'release\win-unpacked\ONclasstime-Uninstall.exe'
& (Join-Path $f 'csc.exe') /nologo /target:winexe /platform:x64 /define:UNINSTALLER $brand $icon $manifest $refs ('/out:'+$uninstall) $source $info
if($LASTEXITCODE -ne 0){throw 'Uninstaller compilation failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$payload=Join-Path $generated 'payload.zip'
if(Test-Path -LiteralPath $payload){Remove-Item -LiteralPath $payload}
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $repo 'release\win-unpacked'),$payload,[IO.Compression.CompressionLevel]::Optimal,$false)
$hash=Get-Sha256 $payload
[IO.File]::WriteAllText($info,('public static class PayloadInfo { public const string Hash="'+$hash+'"; public const string Website="'+$website+'"; }'))
$output=Join-Path $repo 'release\ONclasstime-3.1.0-Setup.exe'
& (Join-Path $f 'csc.exe') /nologo /target:winexe /platform:x64 $brand $icon $manifest $refs ('/resource:'+$payload+',payload.zip') ('/out:'+$output) $source $info
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
$digest=Get-Sha256 $output
[IO.File]::WriteAllText((Join-Path $repo 'release\SHA256SUMS.txt'),$digest+'  ONclasstime-3.1.0-Setup.exe'+[Environment]::NewLine)
Write-Output ('Installer ready: '+$output)
