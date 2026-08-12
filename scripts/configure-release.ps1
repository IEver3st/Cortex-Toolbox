[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath,

  [string]$Repository = 'IEver3st/Cortex-Toolbox',

  [string]$CloudApiUrl = '',

  [string]$WorkOsClientId = ''
)

$ErrorActionPreference = 'Stop'
$resolvedCertificate = (Resolve-Path -LiteralPath $CertificatePath).Path
if ([IO.Path]::GetExtension($resolvedCertificate) -notin @('.p12', '.pfx')) {
  throw 'The Windows signing certificate must be a .p12 or .pfx file.'
}

gh auth status | Out-Null
$password = Read-Host 'Certificate password' -AsSecureString
$pfx = Get-PfxData -FilePath $resolvedCertificate -Password $password
$leaf = @($pfx.EndEntityCertificates)[0]
if (-not $leaf) { throw 'The certificate archive has no end-entity certificate.' }
if ($leaf.NotAfter -le (Get-Date)) { throw 'The signing certificate has expired.' }

$codeSigningOid = '1.3.6.1.5.5.7.3.3'
$enhancedKeyUsage = @(
  $leaf.Extensions |
    Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
    ForEach-Object { $_.EnhancedKeyUsages }
)
if ($enhancedKeyUsage.Count -gt 0 -and $codeSigningOid -notin $enhancedKeyUsage.ObjectId.Value) {
  throw 'The certificate does not permit code signing.'
}

gh api --method PUT "repos/$Repository/environments/release" `
  -F 'deployment_branch_policy[protected_branches]=true' `
  -F 'deployment_branch_policy[custom_branch_policies]=false' | Out-Null
$certificateBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($resolvedCertificate))
$certificateBase64 | gh secret set CORTEX_WINDOWS_CERTIFICATE_BASE64 --repo $Repository --env release
if ($LASTEXITCODE -ne 0) { throw 'Could not upload the signing certificate secret.' }

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $plainPassword | gh secret set CORTEX_WINDOWS_CERTIFICATE_PASSWORD --repo $Repository --env release
  if ($LASTEXITCODE -ne 0) { throw 'Could not upload the signing password secret.' }
} finally {
  $plainPassword = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

if ($CloudApiUrl) {
  $validatedUrl = [Uri]$CloudApiUrl
  if ($validatedUrl.Scheme -ne 'https') { throw 'CloudApiUrl must use HTTPS.' }
  gh variable set CORTEX_CLOUD_API_URL --repo $Repository --env release --body $validatedUrl.AbsoluteUri
  if ($LASTEXITCODE -ne 0) { throw 'Could not configure the public cloud API URL.' }
}

if ($WorkOsClientId) {
  gh variable set CORTEX_WORKOS_CLIENT_ID --repo $Repository --env release --body $WorkOsClientId
  if ($LASTEXITCODE -ne 0) { throw 'Could not configure the public WorkOS client ID.' }
}

Write-Host "Release signing is configured for $Repository."
Write-Host "Certificate subject: $($leaf.Subject)"
Write-Host "Certificate expires: $($leaf.NotAfter.ToString('u'))"
gh secret list --repo $Repository --env release
