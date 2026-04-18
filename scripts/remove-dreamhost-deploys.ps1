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

$plink = "C:\Program Files\PuTTY\plink.exe"

# Show what exists first
$listArgs = @("-batch")
if ($hostKey) { $listArgs += @("-hostkey", $hostKey) }
$listArgs += @("-ssh", "-pw", $pass, "$user@$deployHost", "cd '$root' ; ls -1d site-* 2>/dev/null || echo 'NO_SITE_RELEASES'")
& $plink @listArgs

# Remove only deployment release folders under DEPLOY_ROOT
$removeCmd = "cd '$root' ; rm -rf -- site-* ; ls -1d site-* 2>/dev/null || echo 'REMOVED_ALL_SITE_RELEASES'"
$removeArgs = @("-batch")
if ($hostKey) { $removeArgs += @("-hostkey", $hostKey) }
$removeArgs += @("-ssh", "-pw", $pass, "$user@$deployHost", $removeCmd)
& $plink @removeArgs
