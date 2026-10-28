# TISS XML (rascunho)

O modelo (`LoteTiss`) reflete os dados hoje carregados por `FaturamentoConvenios.tsx`. `gerarLoteTiss` produz XML de rascunho e seu hash SHA-256 para conferência de integridade. O XML atual **não é um documento de transmissão TISS**; não transmitir nem apresentar como compatível com operadoras.

## Pendência: schema e validação

Não há XSD oficial da ANS neste repositório. Não foi inventada uma estrutura de transmissão: o XML gerado usa um envelope explicitamente marcado como rascunho. Antes de gerar mensagem TISS real, incorporar e validar contra os schemas oficiais do Componente de Comunicação, conferir o Componente de Conteúdo e Estrutura e obter os campos do prestador/operadora exigidos pelo leiaute. A ANS publica os arquivos em [Padrão TISS](https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/) e em [Padrões e Schemas](https://www.gov.br/ans/pt-br/arquivos/assuntos/espaco-da-operadora-de-plano-de-saude/compromissos-e-interacoes-com-a-ans/padroes-e-schemas).

Versão alvo para a próxima etapa: **04.03.00**, componente de Comunicação vigente em setembro de 2026 segundo o histórico oficial da ANS. Os lotes existentes podem trazer `04.01.00`; a geração atual preserva a versão registrada, mas não valida compatibilidade nem vigência.
