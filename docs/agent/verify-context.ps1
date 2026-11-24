param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot "..\..")
)

$ErrorActionPreference = "Stop"
$taskRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$taskDocuments = @(
    "AGENTS.md",
    "README.md",
    "docs/PRODUCT.md",
    "docs/ARCHITECTURE.md",
    "docs/agent/PLAN.md",
    "docs/agent/DECISIONS.md",
    "docs/agent/SKILLS.md",
    "docs/agent/SESSION.md"
)
$taskContents = @{}
$taskErrors = New-Object "System.Collections.Generic.List[string]"
$taskLinkCount = 0
$taskLineCounts = @{}
$taskUtf8 = New-Object System.Text.UTF8Encoding($false, $true)

foreach ($taskRelativePath in $taskDocuments) {
    $taskPath = Join-Path $taskRoot $taskRelativePath
    if (-not (Test-Path -LiteralPath $taskPath -PathType Leaf)) {
        $taskErrors.Add("Missing document: $taskRelativePath")
        continue
    }
    $taskContent = [System.IO.File]::ReadAllText($taskPath, $taskUtf8)
    $taskContents[$taskRelativePath] = $taskContent
    $taskLineCounts[$taskRelativePath] = @(
        Get-Content -LiteralPath $taskPath -Encoding UTF8
    ).Count
    if ([string]::IsNullOrWhiteSpace($taskContent)) {
        $taskErrors.Add("Empty document: $taskRelativePath")
    }
    if ($taskContent -match "\{\{[^}]+\}\}|\b(TODO|TBD|FIXME)\b|<(?:project-root|project_name|installer-directory)>") {
        $taskErrors.Add("Unresolved placeholder: $taskRelativePath")
    }
    if ($taskContent -match "(?i)sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|password|secret)\s*[:=]\s*[`"'][A-Za-z0-9+/=_-]{16,}") {
        $taskErrors.Add("Potential secret value: $taskRelativePath")
    }
    foreach ($taskMatch in [regex]::Matches($taskContent, "\[[^\]\r\n]+\]\(([^)\r\n]+)\)")) {
        $taskTarget = $taskMatch.Groups[1].Value.Trim()
        if ($taskTarget -match "^(https?://|mailto:|#)") {
            continue
        }
        $taskTarget = ($taskTarget -split "#", 2)[0].Trim("<", ">")
        $taskTarget = [System.Uri]::UnescapeDataString($taskTarget)
        $taskLinkPath = Join-Path (Split-Path -Parent $taskPath) $taskTarget
        if (-not (Test-Path -LiteralPath $taskLinkPath)) {
            $taskErrors.Add("Broken link in ${taskRelativePath}: $taskTarget")
        }
        $taskLinkCount++
    }
}

$taskRequirementCount = 0
if ($taskContents.ContainsKey("docs/PRODUCT.md") -and $taskContents.ContainsKey("docs/agent/PLAN.md")) {
    $taskRequirementIds = @(
        [regex]::Matches($taskContents["docs/PRODUCT.md"], "(?m)^### (R\d{2})\b") |
            ForEach-Object { $_.Groups[1].Value }
    )
    $taskRequirementCount = $taskRequirementIds.Count
    foreach ($taskRequirementId in $taskRequirementIds) {
        if ($taskContents["docs/agent/PLAN.md"] -notmatch ("\b" + $taskRequirementId + "\b")) {
            $taskErrors.Add("Requirement missing from plan: $taskRequirementId")
        }
    }
    if ($taskRequirementCount -ne 15) {
        $taskErrors.Add("Expected 15 requirements, found $taskRequirementCount")
    }
}

$taskSkillCount = 0
if ($taskContents.ContainsKey("docs/agent/SKILLS.md")) {
    $taskProfile = $taskContents["docs/agent/SKILLS.md"]
    $taskSkillRows = [regex]::Matches(
        $taskProfile,
        '(?m)^\| `([^\`]+)` \|[^\r\n]+?\| `(~\/[^\`]+\/SKILL\.md)` \|'
    )
    foreach ($taskSkillRow in $taskSkillRows) {
        $taskSkillName = $taskSkillRow.Groups[1].Value
        $taskSkillLocator = $taskSkillRow.Groups[2].Value
        $taskSkillPath = Join-Path $env:USERPROFILE $taskSkillLocator.Substring(2)
        if (-not (Test-Path -LiteralPath $taskSkillPath -PathType Leaf)) {
            $taskErrors.Add("Missing skill source: $taskSkillName")
            continue
        }
        $taskSkillContent = [System.IO.File]::ReadAllText($taskSkillPath, $taskUtf8)
        $taskNamePattern = "(?m)^name:\s*" + [regex]::Escape($taskSkillName) + "\s*$"
        if ($taskSkillContent -notmatch $taskNamePattern) {
            $taskErrors.Add("Skill name mismatch: $taskSkillName")
        }
        if ($taskContents["AGENTS.md"] -notmatch [regex]::Escape($taskSkillName)) {
            $taskErrors.Add("Skill route missing from AGENTS.md: $taskSkillName")
        }
        $taskSkillCount++
    }
    if ($taskSkillRows.Count -ne 12) {
        $taskErrors.Add("Expected 12 skill source rows, found " + $taskSkillRows.Count)
    }
}

if ($taskErrors.Count -gt 0) {
    foreach ($taskError in $taskErrors) {
        Write-Output ("FAIL: " + $taskError)
    }
    exit 1
}

Write-Output ("PASS: " + $taskDocuments.Count + " Markdown files are valid UTF-8 and non-empty.")
Write-Output ("PASS: " + $taskLinkCount + " local links resolve.")
Write-Output ("PASS: " + $taskRequirementCount + " requirement IDs are referenced in the plan.")
Write-Output ("PASS: " + $taskSkillCount + " skill sources exist and names/routes match.")
Write-Output "PASS: No unresolved placeholders or obvious secret values."
Write-Output ("INFO: AGENTS.md has " + $taskLineCounts["AGENTS.md"] + " lines; SESSION.md has " + $taskLineCounts["docs/agent/SESSION.md"] + " lines.")
Write-Output ("INFO: PowerShell " + $PSVersionTable.PSVersion.ToString())
exit 0
