$ErrorActionPreference = "Stop"
$project = "C:\Users\mrwob\OneDrive\Desktop\Sites\Bible Study\Bible Study"
$envFile = Join-Path $project ".env"

$cfg = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $k = $line.Substring(0, $idx).Trim()
  $v = $line.Substring($idx + 1)
  $cfg[$k] = $v
}

$deployHost = $cfg["DEPLOY_HOST"]
$user = $cfg["DEPLOY_USER"]
$pass = $cfg["DEPLOY_PASS"]
$root = $cfg["DEPLOY_ROOT"]
$hostKey = $cfg["DEPLOY_HOSTKEY"]

if (-not $deployHost -or -not $user -or -not $pass -or -not $root) {
  throw "Missing one or more required DEPLOY_* values in .env"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$releaseName = "site-$timestamp"
$remoteDir = "$root/$releaseName"
$staging = Join-Path $env:TEMP "bst-deploy-$timestamp"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$includePaths = @(
  "assets\\css",
  "assets\\js",
  "assets\\images\\icon.png",
  "assets\\images\\nature-background.jpg",
  "index.html",
  "auth.html",
  "admin.html",
  "user-admin.html",
  "editor.html",
  "student.html",
  "teacher.html",
  "server.js",
  "db.js",
  "package.json",
  "package-lock.json"
)

foreach ($rel in $includePaths) {
  $src = Join-Path $project $rel
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination $staging -Recurse -Force
  }
}

# Write a sanitized runtime .env (exclude deploy transport credentials)
$runtimeEnvLines = Get-Content $envFile | Where-Object {
  $trimmed = $_.Trim()
  if (-not $trimmed) { return $true }
  if ($trimmed.StartsWith('#')) { return $true }
  return -not ($trimmed -match '^DEPLOY_')
}
Set-Content -Path (Join-Path $staging '.env') -Value $runtimeEnvLines -Encoding UTF8

$plink = "C:\Program Files\PuTTY\plink.exe"
$pscp = "C:\Program Files\PuTTY\pscp.exe"

$plinkArgs = @("-batch")
if ($hostKey) { $plinkArgs += @("-hostkey", $hostKey) }
$plinkArgs += @("-ssh", "-pw", $pass, "$user@$deployHost", "mkdir -p '$remoteDir'")
& $plink @plinkArgs

$pscpArgs = @("-batch", "-r")
if ($hostKey) { $pscpArgs += @("-hostkey", $hostKey) }
$pscpArgs += @("-pw", $pass, (Join-Path $staging "*"), "${user}@${deployHost}:$remoteDir/")
& $pscp @pscpArgs

$installCmd = "cd '$remoteDir' ; if command -v npm >/dev/null 2>&1; then npm ci --omit=dev --no-audit --no-fund; else echo 'npm not found on remote host'; fi"
$plinkInstallArgs = @("-batch")
if ($hostKey) { $plinkInstallArgs += @("-hostkey", $hostKey) }
$plinkInstallArgs += @("-ssh", "-pw", $pass, "$user@$deployHost", $installCmd)
& $plink @plinkInstallArgs

Write-Output "DEPLOY_REMOTE_DIR=$remoteDir"
Write-Output "DEPLOY_STAGING_DIR=$staging"
