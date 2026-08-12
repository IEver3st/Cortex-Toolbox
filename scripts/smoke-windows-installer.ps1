[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [ValidateSet('stable', 'beta')]
  [string]$Channel = 'stable',

  [switch]$AllowLocalMachine
)

$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true' -and -not $AllowLocalMachine) {
  throw 'Installer smoke testing is destructive to an existing Cortex installation. Run it on CI or pass -AllowLocalMachine explicitly.'
}

$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$executableName = if ($Channel -eq 'beta') { 'cortex-toolbox-beta.exe' } else { 'cortex-toolbox.exe' }
$profileRoot = Join-Path ([IO.Path]::GetTempPath()) "cortex-installer-smoke-$([guid]::NewGuid().ToString('N'))"
$installedExecutable = $null
$installRoot = $null

function Wait-ProcessExit([Diagnostics.Process]$Process, [int]$TimeoutMilliseconds, [string]$Description) {
  if (-not $Process.WaitForExit($TimeoutMilliseconds)) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    throw "$Description timed out."
  }
  if ($Process.ExitCode -ne 0) { throw "$Description exited with code $($Process.ExitCode)." }
}

function Stop-InstalledProcesses([string]$ExecutablePath) {
  if (-not $ExecutablePath) { return }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $ExecutablePath } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Wait-InstalledProcessesExit([string]$ExecutablePath, [int]$TimeoutMilliseconds) {
  if (-not $ExecutablePath) { return }
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    $running = @(
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -eq $ExecutablePath }
    )
    if ($running.Count -eq 0) { return }
    if ($stopwatch.ElapsedMilliseconds -ge $TimeoutMilliseconds) {
      throw 'The installed application processes did not stop before uninstall.'
    }
    Start-Sleep -Milliseconds 250
  }
}

function Wait-PathRemoval([string]$Path, [int]$TimeoutMilliseconds) {
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()
  while (Test-Path -LiteralPath $Path) {
    if ($stopwatch.ElapsedMilliseconds -ge $TimeoutMilliseconds) {
      throw "The clean-runner uninstall left the installed application behind at $Path."
    }
    Start-Sleep -Milliseconds 250
  }
}

try {
  New-Item -ItemType Directory -Path $profileRoot | Out-Null
  $setup = Start-Process -FilePath $installer -ArgumentList '--silent' -PassThru
  Wait-ProcessExit $setup 180000 'Squirrel installation'

  $installedExecutable = Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Recurse -File -Filter $executableName -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.Name -like 'app-*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $installedExecutable) { throw "The installer did not create $executableName." }

  $installRoot = Split-Path -Parent $installedExecutable.DirectoryName
  $application = Start-Process -FilePath $installedExecutable.FullName -ArgumentList @(
    "--user-data-dir=$profileRoot",
    '--disable-gpu'
  ) -PassThru
  Start-Sleep -Seconds 10
  $running = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.ExecutablePath -eq $installedExecutable.FullName }
  )
  if ($application.HasExited -and $running.Count -eq 0) {
    throw 'The installed application exited before the smoke interval completed.'
  }
  Write-Host "Installed launch passed: $($installedExecutable.FullName)"
} finally {
  Stop-InstalledProcesses $(if ($installedExecutable) { $installedExecutable.FullName } else { $null })
  Wait-InstalledProcessesExit $(if ($installedExecutable) { $installedExecutable.FullName } else { $null }) 15000
  if ($installRoot) {
    $updater = Join-Path $installRoot 'Update.exe'
    if (Test-Path -LiteralPath $updater) {
      $uninstall = Start-Process -FilePath $updater -ArgumentList @('--uninstall', '-s') -PassThru
      Wait-ProcessExit $uninstall 180000 'Squirrel uninstall'
    }
  }
  if (Test-Path -LiteralPath $profileRoot) {
    Remove-Item -LiteralPath $profileRoot -Recurse -Force
  }
}

if ($installedExecutable) {
  Wait-PathRemoval $installedExecutable.FullName 30000
}
Write-Host 'Installer install, launch, and uninstall smoke passed.'
