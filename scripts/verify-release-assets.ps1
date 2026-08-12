[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactsDirectory,

  [ValidateSet('stable', 'beta')]
  [string]$Channel,

  [switch]$RequireSignature,

  [switch]$InstallSmoke
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ArtifactsDirectory).Path
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File)
if ($files.Count -eq 0) { throw 'No release artifacts were found.' }

$duplicates = @($files | Group-Object Name | Where-Object Count -gt 1)
if ($duplicates.Count -gt 0) {
  throw "Release asset names must be unique: $($duplicates.Name -join ', ')"
}

$installerName = if ($Channel -eq 'beta') { 'CortexToolBoxBetaSetup.exe' } else { 'CortexToolBoxSetup.exe' }
$required = @($installerName, 'RELEASES', 'SHA256SUMS-Windows.txt', 'cortex-windows.cdx.json')
foreach ($name in $required) {
  if ($name -notin $files.Name) { throw "Required release asset is missing: $name" }
}
if (-not ($files.Name | Where-Object { $_ -like '*-win32-x64.zip' })) {
  throw 'The portable Windows ZIP is missing.'
}
if (-not ($files.Name | Where-Object { $_ -like '*-full.nupkg' })) {
  throw 'The Squirrel full NUPKG is missing.'
}

$sbomFile = $files | Where-Object Name -eq 'cortex-windows.cdx.json' | Select-Object -First 1
$sbom = Get-Content -LiteralPath $sbomFile.FullName -Raw | ConvertFrom-Json
if ($sbom.bomFormat -ne 'CycloneDX' -or -not $sbom.specVersion) {
  throw 'The release SBOM is not a valid CycloneDX document.'
}

$releasesFile = $files | Where-Object Name -eq 'RELEASES' | Select-Object -First 1
$releaseLines = @(Get-Content -LiteralPath $releasesFile.FullName | Where-Object { $_.Trim() })
if ($releaseLines.Count -eq 0) { throw 'The Squirrel RELEASES manifest is empty.' }
foreach ($line in $releaseLines) {
  if ($line -notmatch '^[a-fA-F0-9]{40}\s+([^\s]+-full\.nupkg)\s+([1-9][0-9]*)$') {
    throw "Invalid Squirrel RELEASES entry: $line"
  }
  if ($Matches[1] -notin $files.Name) { throw "Squirrel package is missing: $($Matches[1])" }
}

$checksumFile = $files | Where-Object Name -eq 'SHA256SUMS-Windows.txt' | Select-Object -First 1
$checksums = @{}
foreach ($line in Get-Content -LiteralPath $checksumFile.FullName) {
  if (-not $line.Trim()) { continue }
  if ($line -notmatch '^([a-fA-F0-9]{64})\s{2}(.+)$') { throw "Invalid checksum line: $line" }
  $assetName = [IO.Path]::GetFileName($Matches[2].Replace('\', '/'))
  if ($checksums.ContainsKey($assetName)) { throw "Duplicate checksum entry: $assetName" }
  $checksums[$assetName] = $Matches[1].ToLowerInvariant()
}

foreach ($file in $files | Where-Object Name -ne 'SHA256SUMS-Windows.txt') {
  if (-not $checksums.ContainsKey($file.Name)) { throw "Checksum is missing for $($file.Name)." }
  $actual = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($checksums[$file.Name] -ne $actual) { throw "Checksum mismatch for $($file.Name)." }
}
$extraChecksums = @($checksums.Keys | Where-Object { $_ -notin $files.Name })
if ($extraChecksums.Count -gt 0) { throw "Checksums reference missing assets: $($extraChecksums -join ', ')" }

$installer = $files | Where-Object Name -eq $installerName | Select-Object -First 1
if ($RequireSignature) {
  $signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
    throw "Installer signature is $($signature.Status), expected Valid."
  }
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) "cortex-release-assets-$([guid]::NewGuid().ToString('N'))"
try {
  New-Item -ItemType Directory -Path $temporary | Out-Null
  $portableZip = $files | Where-Object Name -like '*-win32-x64.zip' | Select-Object -First 1
  Expand-Archive -LiteralPath $portableZip.FullName -DestinationPath $temporary
  $portableExecutableName = if ($Channel -eq 'beta') { 'cortex-toolbox-beta.exe' } else { 'cortex-toolbox.exe' }
  $portableExecutable = Get-ChildItem -LiteralPath $temporary -Recurse -File -Filter $portableExecutableName | Select-Object -First 1
  if (-not $portableExecutable) { throw "Portable ZIP does not contain $portableExecutableName." }
  if ($RequireSignature) {
    $portableSignature = Get-AuthenticodeSignature -LiteralPath $portableExecutable.FullName
    if ($portableSignature.Status -ne 'Valid' -or -not $portableSignature.SignerCertificate) {
      throw "Portable executable signature is $($portableSignature.Status), expected Valid."
    }
  }
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
}

if ($InstallSmoke) {
  & (Join-Path $PSScriptRoot 'smoke-windows-installer.ps1') -InstallerPath $installer.FullName -Channel $Channel
}
Write-Host "Verified $($files.Count) release assets for the $Channel channel."
