$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'dialogflow-agent'
$destinationDirectory = Join-Path $projectRoot 'dist'
$destination = Join-Path $destinationDirectory 'Weather-Info-Forecast-Bot.zip'

if (-not (Test-Path -LiteralPath $source)) {
  throw "Dialogflow agent source not found: $source"
}

New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
if (Test-Path -LiteralPath $destination) {
  Remove-Item -LiteralPath $destination
}

Compress-Archive -Path (Join-Path $source '*') -DestinationPath $destination -CompressionLevel Optimal
Write-Output "Created $destination"

