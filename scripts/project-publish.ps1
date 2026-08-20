param(
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previousGitHubUser = gh api user --jq .login

Push-Location $projectRoot
try {
  gh auth switch --hostname github.com --user elolabbancodedados2

  if (-not $SkipTests) {
    npm run test:run
    npm run check:permissoes
    npm run check:falhas
    npm run check:colunas
    npm run check:a11y
  }

  npm run build
  git push origin main
} finally {
  if ($previousGitHubUser) {
    gh auth switch --hostname github.com --user $previousGitHubUser | Out-Null
  }
  Pop-Location
}
