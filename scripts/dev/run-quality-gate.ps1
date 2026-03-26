param(
    [Parameter(Mandatory = $true)]
    [string]$Label,

    [Parameter(Mandatory = $true)]
    [string]$Command,

    [ValidateSet("test", "build", "lint", "custom")]
    [string]$Type = "test"
)

$ErrorActionPreference = "Stop"

$dateFolder = Get-Date -Format "yyyyMMdd"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path "logs/copilot" $dateFolder

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$safeLabel = ($Label -replace "[^a-zA-Z0-9_-]", "-")
$logFile = Join-Path $logDir "$Type-$safeLabel-$timestamp.log"

"[INFO] Started: $(Get-Date -Format o)" | Tee-Object -FilePath $logFile
"[INFO] Label: $Label" | Tee-Object -FilePath $logFile -Append
"[INFO] Command: $Command" | Tee-Object -FilePath $logFile -Append

try {
    Invoke-Expression "$Command" 2>&1 | Tee-Object -FilePath $logFile -Append
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) {
        $exitCode = 0
    }
}
catch {
    $_ | Out-String | Tee-Object -FilePath $logFile -Append
    $exitCode = 1
}

"[INFO] ExitCode: $exitCode" | Tee-Object -FilePath $logFile -Append
"[INFO] Finished: $(Get-Date -Format o)" | Tee-Object -FilePath $logFile -Append
"[INFO] LogFile: $logFile" | Tee-Object -FilePath $logFile -Append

Write-Output "LogFile=$logFile"
exit $exitCode
