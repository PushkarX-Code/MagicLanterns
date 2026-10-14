# Magic Lanterns installer for Windows.
# Usage (PowerShell):  irm https://raw.githubusercontent.com/PushkarX-Code/MagicLanterns/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow

$url = 'https://github.com/PushkarX-Code/MagicLanterns/releases/latest/download/MagicLanterns-Setup.exe'
$installer = Join-Path $env:TEMP 'MagicLanterns-Setup.exe'

Write-Host 'Downloading Magic Lanterns...' -ForegroundColor Yellow
Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing

Write-Host 'Opening the installer...' -ForegroundColor Yellow
Start-Process -FilePath $installer -Wait
Remove-Item $installer -ErrorAction SilentlyContinue
Write-Host 'Done. Find Magic Lanterns in the Start menu.' -ForegroundColor Green
