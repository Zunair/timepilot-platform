param(
    [int]$Tail = 120
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "logs/copilot")) {
    Write-Output "No logs found at logs/copilot"
    exit 0
}

$latest = Get-ChildItem -Path "logs/copilot" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($null -eq $latest) {
    Write-Output "No log files found under logs/copilot"
    exit 0
}

Write-Output "LatestLog=$($latest.FullName)"
Get-Content -Path $latest.FullName -Tail $Tail
