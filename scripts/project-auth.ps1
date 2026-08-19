$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$authRoot = Join-Path $projectRoot '.project-auth'
$env:GH_CONFIG_DIR = Join-Path $authRoot 'github'
$env:XDG_CONFIG_HOME = Join-Path $authRoot 'cloudflare'

New-Item -ItemType Directory -Force -Path $env:GH_CONFIG_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $env:XDG_CONFIG_HOME | Out-Null

Write-Host 'Autenticação isolada do EloLab — não altera as contas dos outros projetos.'
Write-Host 'GitHub: entre com uma conta que tenha acesso a elolabbancodedados2/elolab.'
gh auth login --hostname github.com --git-protocol https --web

Write-Host 'Cloudflare: entre com a conta proprietária do projeto elolab-app.'
npx wrangler login

Write-Host 'Credenciais do EloLab configuradas e isoladas em .project-auth.'
