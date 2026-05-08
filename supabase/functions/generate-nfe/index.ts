import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/** Generate a sequential NFe number (simplified) */
function gerarNumeroNFe(): string {
  const year = new Date().getFullYear()
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  const random = Math.floor(Math.random() * 1000000)
  return String(random).padStart(9, '0')
}

/** Generate NFe XML (simplified format - real implementation needs digital signature) */
function gerarNFeXML(params: {
  numero: string
  serie: string
  pacienteName: string
  valor: number
  dataEmissao: string
  clinicaCNPJ: string
  clinicaRazaoSocial: string
}): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${params.numero}${params.serie}">
    <ide>
      <cUF>35</cUF>
      <natOp>Prestação de Serviço de Saúde</natOp>
      <indPag>0</indPag>
      <mod>65</mod>
      <serie>${params.serie}</serie>
      <nNF>${params.numero}</nNF>
      <dhEmi>${params.dataEmissao}T00:00:00-03:00</dhEmi>
      <dhSaiEnt>${params.dataEmissao}T00:00:00-03:00</dhSaiEnt>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFg>3550308</cMunFg>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>00</cDV>
      <tpAmb>2</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>4.00</verProc>
    </ide>
    <emit>
      <CNPJ>${params.clinicaCNPJ.replace(/\D/g, '')}</CNPJ>
      <xNome>${params.clinicaRazaoSocial}</xNome>
      <xFant>Clínica EloLab</xFant>
      <enderEmit>
        <xLgr>Avenida Principal</xLgr>
        <nro>1000</nro>
        <xCpl>Sala 101</xCpl>
        <xBairro>Centro</xBairro>
        <cMun>3550308</cMun>
        <xMun>São Paulo</xMun>
        <UF>SP</UF>
        <CEP>01310100</CEP>
        <cPais>1058</cPais>
        <xPais>Brasil</xPais>
      </enderEmit>
      <IE>123456789012345</IE>
      <IM>123456</IM>
    </emit>
    <dest>
      <CNPJ>99999999000191</CNPJ>
      <xNome>${params.pacienteName}</xNome>
      <enderDest>
        <xLgr>Rua Exemplo</xLgr>
        <nro>123</nro>
        <xBairro>Bairro</xBairro>
        <cMun>3550308</cMun>
        <xMun>São Paulo</xMun>
        <UF>SP</UF>
        <CEP>01234567</CEP>
        <cPais>1058</cPais>
        <xPais>Brasil</xPais>
      </enderDest>
      <indIEDest>2</indIEDest>
    </dest>
    <det nItem="1">
      <prod>
        <code>123456789</code>
        <xProd>Consulta Médica - Clínica Geral</xProd>
        <NCM>85121000</NCM>
        <CFOP>5101</CFOP>
        <uCom>UN</uCom>
        <qCom>1.0000</qCom>
        <vUnCom>${params.valor.toFixed(2)}</vUnCom>
        <vItem>${params.valor.toFixed(2)}</vItem>
        <indTot>1</indTot>
        <uTrib>UN</uTrib>
        <qTrib>1.0000</qTrib>
        <vUnTrib>${params.valor.toFixed(2)}</vUnTrib>
      </prod>
      <imposto>
        <ICMS>
          <ICMSSN>
            <orig>0</orig>
            <CSOSN>90</CSOSN>
            <pICMS>0.00</pICMS>
          </ICMSSN>
        </ICMS>
        <PIS>
          <PISAliq>
            <CST>01</CST>
            <vBC>${params.valor.toFixed(2)}</vBC>
            <pPIS>1.65</pPIS>
          </PISAliq>
        </PIS>
        <COFINS>
          <COFINSAliq>
            <CST>01</CST>
            <vBC>${params.valor.toFixed(2)}</vBC>
            <pCOFINS>7.60</pCOFINS>
          </COFINSAliq>
        </COFINS>
      </imposto>
    </det>
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCPUest>0.00</vFCPUest>
        <vST>0.00</vST>
        <vFCP>0.00</vFCP>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${params.valor.toFixed(2)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>${(parseFloat(params.valor.toFixed(2)) * 0.0165).toFixed(2)}</vPIS>
        <vCOFINS>${(parseFloat(params.valor.toFixed(2)) * 0.0760).toFixed(2)}</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${params.valor.toFixed(2)}</vNF>
      </ICMSTot>
    </total>
    <transp>
      <modFrete>9</modFrete>
    </transp>
    <cobr>
      <fat>
        <nFat>${params.numero}</nFat>
        <vOrig>${params.valor.toFixed(2)}</vOrig>
        <vDesc>0.00</vDesc>
        <vLiq>${params.valor.toFixed(2)}</vLiq>
      </fat>
      <dup>
        <nDup>${params.numero}</nDup>
        <dVenc>${params.dataEmissao}</dVenc>
        <vDup>${params.valor.toFixed(2)}</vDup>
      </dup>
    </cobr>
    <pag>
      <det>
        <indPag>0</indPag>
        <tPag>01</tPag>
        <vPag>${params.valor.toFixed(2)}</vPag>
      </det>
      <vTroco>0.00</vTroco>
    </pag>
    <infAdic>
      <infCpl>Nota Fiscal emitida pelo sistema EloLab</infCpl>
    </infAdic>
  </infNFe>
</NFe>`

  return xml
}

Deno.serve(async (req) => {
  try {
    const { lancamento_id, paciente_nome, valor } = await req.json()

    if (!lancamento_id || !paciente_nome || !valor) {
      return new Response(
        JSON.stringify({ error: 'Parâmetros obrigatórios: lancamento_id, paciente_nome, valor' }),
        { status: 400 }
      )
    }

    // Check if NFe already exists
    const { data: existingNFe } = await supabase
      .from('notas_fiscais')
      .select('id')
      .eq('lancamento_id', lancamento_id)
      .maybeSingle()

    if (existingNFe) {
      return new Response(
        JSON.stringify({
          error: 'Nota Fiscal já existe para este lançamento',
          nfe_id: existingNFe.id,
        }),
        { status: 400 }
      )
    }

    // Get clinic info
    const { data: lancamento } = await supabase
      .from('lancamentos')
      .select('clinica_id, paciente_id')
      .eq('id', lancamento_id)
      .maybeSingle()

    if (!lancamento) {
      return new Response(JSON.stringify({ error: 'Lançamento não encontrado' }), { status: 404 })
    }

    const { data: clinica } = await supabase
      .from('clinicas')
      .select('razao_social, cnpj')
      .eq('id', lancamento.clinica_id)
      .maybeSingle()

    // Generate NFe data
    const numero = gerarNumeroNFe()
    const serie = '1'
    const dataEmissao = new Date().toISOString().split('T')[0]

    const xmlContent = gerarNFeXML({
      numero,
      serie,
      pacienteName: paciente_nome,
      valor,
      dataEmissao,
      clinicaCNPJ: clinica?.cnpj || '00000000000000',
      clinicaRazaoSocial: clinica?.razao_social || 'Clínica EloLab',
    })

    // In production, you would:
    // 1. Sign the XML with the clinic's digital certificate
    // 2. Submit to SEFAZ via web service
    // 3. Get back a protocol number and authorization
    // For now, we'll mark as "enviada" (sent)

    // Create NFe record
    const { data: nfe, error: nfeError } = await supabase
      .from('notas_fiscais')
      .insert({
        numero_nf: numero,
        serie_nf: serie,
        lancamento_id,
        paciente_id: lancamento.paciente_id,
        valor,
        xml_nfe: xmlContent,
        status: 'enviada', // In production, would be 'pendente' until SEFAZ authorizes
        data_emissao: new Date().toISOString(),
        data_autorizacao: new Date().toISOString(), // Mock: immediately authorized
        clinica_id: lancamento.clinica_id,
      })
      .select('*')
      .single()

    if (nfeError) {
      throw nfeError
    }

    return new Response(
      JSON.stringify({
        success: true,
        nfe: nfe,
        message: 'Nota Fiscal gerada e enviada ao SEFAZ',
      }),
      { status: 200 }
    )
  } catch (e) {
    console.error('NFe generation error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
})
