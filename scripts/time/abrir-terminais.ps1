# Abre uma janela do Windows Terminal com uma aba por agente do time (.claude/agents).
# Cada aba roda `claude --agent <nome>` na raiz do repositório.
# Uso: powershell -File scripts/time/abrir-terminais.ps1 [-Agentes tech-lead,qa-engineer] [-Janela elolab-time]
param(
  [string[]]$Agentes,
  [string]$Janela = 'elolab-time'
)

$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $Agentes -or $Agentes.Count -eq 0) {
  $Agentes = Get-ChildItem (Join-Path $raiz '.claude\agents') -Filter *.md | ForEach-Object { $_.BaseName }
}

# Preserva o perfil do Claude Code em uso (ex.: perfis do Orca) nas novas abas.
$prefixo = ''
if ($env:CLAUDE_CONFIG_DIR) { $prefixo = "set `"CLAUDE_CONFIG_DIR=$($env:CLAUDE_CONFIG_DIR)`"&& " }

foreach ($agente in $Agentes) {
  & wt.exe -w $Janela new-tab --title $agente -d $raiz cmd /k "$prefixo claude --agent $agente"
  Start-Sleep -Milliseconds 400
}
Write-Output "Abertas $($Agentes.Count) abas na janela '$Janela'."
