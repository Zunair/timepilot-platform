param()

$ErrorActionPreference = "Stop"
$failed = $false

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        Write-Error "[FAIL] $Message"
        $script:failed = $true
    }
    else {
        Write-Output "[PASS] $Message"
    }
}

$requiredFiles = @(
    ".github/instructions/copilot.instructions.md",
    ".github/instructions/GOVERNANCE.md",
    ".github/instructions/phase-gates.md",
    ".github/instructions/verification.md",
    ".github/instructions/quality-and-logs.md",
    ".claude/rules/code.instructions.md",
    ".claude/rules/documentation.instructions.md",
    "docs/Phase.RoadMap.md"
)

Write-Output "Checking required instruction files..."
foreach ($file in $requiredFiles) {
    Assert-True -Condition (Test-Path $file) -Message "Exists: $file"
}

$todoFiles = Get-ChildItem -Path "docs/todo" -Filter "TODO.Phase*.md" -ErrorAction SilentlyContinue
Assert-True -Condition ($todoFiles.Count -eq 12) -Message "Found 12 phase TODO files"

foreach ($todo in $todoFiles) {
    $content = Get-Content -Raw -Path $todo.FullName
    Assert-True -Condition ($content -match "## Phase Status") -Message "Phase status section exists in $($todo.Name)"
    Assert-True -Condition ($content -match "- State: (NOT-STARTED|IN-PROGRESS|COMPLETED|BLOCKED|DEFERRED)") -Message "Valid state exists in $($todo.Name)"
    Assert-True -Condition ($content -notmatch "`\[NOT-STARTED`\]|`\[IN-PROGRESS`\]|`\[COMPLETED`\]|`\[BLOCKED`\]|`\[DEFERRED`\]") -Message "No legacy backticked states in $($todo.Name)"
}

$copilot = Get-Content -Raw -Path ".github/instructions/copilot.instructions.md"
Assert-True -Condition ($copilot -match "/\.github/instructions/quality-and-logs\.md") -Message "Copilot instructions reference quality-and-logs"
Assert-True -Condition ($copilot -match "After each major change, run tests and capture logs") -Message "Copilot instructions enforce post-change tests/logs"

if ($failed) {
    Write-Error "One or more validation checks failed."
    exit 1
}

Write-Output "All instruction validation checks passed."
exit 0
