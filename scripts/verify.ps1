$ErrorActionPreference = "Stop"
$taskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $taskProjectRoot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Write-Output ("PowerShell " + $PSVersionTable.PSVersion.ToString())

foreach ($taskScript in @("build", "lint", "test", "test:e2e")) {
    & npm.cmd run $taskScript
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

Write-Output "PASS: Build, lint, unit tests and E2E completed."
exit 0
