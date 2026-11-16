# STC Testing System - one-click updater (Admin PC only).
# Downloads the latest code from GitHub and copies it over this folder.
# Your data folder (students, tests, results) is NEVER touched.
$ErrorActionPreference = 'Stop'
$InstallDir = $PSScriptRoot
$Repo = 'parvindarjambra/stc-testing-system'
$Branch = 'main'
$ZipUrl = "https://codeload.github.com/$Repo/zip/refs/heads/$Branch"
$TempZip = Join-Path $env:TEMP 'stc-testing-system-update.zip'
$TempDir = Join-Path $env:TEMP 'stc-testing-system-update'

Write-Host ''
Write-Host '  STC Testing System - Update'
Write-Host '  Downloading latest version from GitHub...'
try {
  Invoke-WebRequest -Uri $ZipUrl -OutFile $TempZip -UseBasicParsing
} catch {
  Write-Host ''
  Write-Host '  ERROR: Download failed. Check internet and try again.'
  Write-Host "  $($_.Exception.Message)"
  exit 1
}

if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir | Out-Null
Expand-Archive -Path $TempZip -DestinationPath $TempDir -Force
$Extracted = Join-Path $TempDir "$($Repo.Split('/')[1])-$Branch"
if (-not (Test-Path $Extracted)) { $Extracted = (Get-ChildItem $TempDir -Directory | Select-Object -First 1).FullName }

Write-Host '  Copying new files (your data folder is kept as-is)...'
Get-ChildItem $Extracted | Where-Object { $_.Name -ne 'data' } | ForEach-Object {
  if ($_.Name -eq 'STC-Testing-System.url' -and (Test-Path (Join-Path $InstallDir $_.Name))) {
    Write-Host '  Keeping your edited laptop shortcut.'
  } else {
    Copy-Item $_.FullName -Destination $InstallDir -Recurse -Force
  }
}

# The logo ships as base64 text in the repo; decode it to the real image file.
$B64 = Join-Path $InstallDir 'public\stc-logo.webp.b64'
$Logo = Join-Path $InstallDir 'public\stc-logo.webp'
if (Test-Path $B64) {
  [IO.File]::WriteAllBytes($Logo, [Convert]::FromBase64String([IO.File]::ReadAllText($B64)))
  Write-Host '  Logo restored.'
}

Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host '  Update done.'
Write-Host '  Close the old black server window (if open), then double-click START.bat.'
