$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$authRoot = Join-Path $projectRoot '.project-auth'
$env:XDG_CONFIG_HOME = Join-Path $authRoot 'cloudflare'

New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null

Write-Host 'GitHub suporta várias contas simultâneas; nenhuma conta será desconectada.'
Write-Host 'GitHub: entre com uma conta que tenha acesso a elolabbancodedados2/elolab.'
gh auth login --hostname github.com --git-protocol https --web
Write-Host 'Conta adicionada. O deploy do Cloudflare usa os segredos isolados do GitHub Actions.'
