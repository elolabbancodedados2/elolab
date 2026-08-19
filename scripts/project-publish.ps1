param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$authRoot = Join-Path $projectRoot '.project-auth'
$env:GH_CONFIG_DIR = Join-Path $authRoot 'github'
$env:XDG_CONFIG_HOME = Join-Path $authRoot 'cloudflare'

if (-not (Test-Path $env:GH_CONFIG_DIR)) {
  throw 'Credencial isolada ausente. Execute primeiro: .\scripts\project-auth.ps1'
}

Push-Location $projectRoot
try {
  gh auth status
  npx wrangler whoami

  if (-not $SkipTests) {
    npm run test:run
    npm run check:permissoes
    npm run check:falhas
    npm run check:colunas
    npm run check:a11y
  }

  npm run build
  git push origin main
  npx wrangler pages deploy dist --project-name=elolab-app --branch=main --commit-dirty=true
} finally {
  Pop-Location
}
