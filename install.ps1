#Requires -Version 5.1

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Ref,

    [ValidateNotNullOrEmpty()]
    [string]$Repository = "https://github.com/HsinPu/SymbolLattice.git",

    [ValidateNotNullOrEmpty()]
    [string]$NpmPrefix,

    [ValidateNotNullOrEmpty()]
    [string]$TempRoot,

    [switch]$Apply,
    [switch]$Yes,
    [switch]$Json
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = "Stop"

$plannerPath = Join-Path $PSScriptRoot "scripts\github-source-install.mjs"
if (-not (Test-Path -LiteralPath $plannerPath -PathType Leaf)) {
    throw "The GitHub source installation planner is missing: $plannerPath"
}

$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($null -eq $nodeCommand) {
    throw "Node.js >=22.13 <25 is required and must be available on PATH."
}

$plannerArguments = @(
    $plannerPath,
    "--ref", $Ref,
    "--repository", $Repository
)
if ($PSBoundParameters.ContainsKey("NpmPrefix")) {
    $plannerArguments += @("--npm-prefix", $NpmPrefix)
}
if ($PSBoundParameters.ContainsKey("TempRoot")) {
    $plannerArguments += @("--temp-root", $TempRoot)
}
if ($Apply.IsPresent) {
    $plannerArguments += "--apply"
}
if ($Yes.IsPresent) {
    $plannerArguments += "--yes"
}
if ($Json.IsPresent) {
    $plannerArguments += "--json"
}

& $nodeCommand.Source @plannerArguments
$plannerExitCode = $LASTEXITCODE
if ($null -eq $plannerExitCode) {
    exit 1
}
exit $plannerExitCode
