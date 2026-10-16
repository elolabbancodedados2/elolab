import { describe, expect, it } from 'vitest';
import { analyzeTemplatePreview } from '../templatePreview';

describe('prévia sintética de modelos de comunicação', () => {
  it('substitui variáveis disponíveis e lista variáveis distintas do assunto e do conteúdo', () => {
    const preview = analyzeTemplatePreview({
      name: 'Lembrete 24h', category: 'lembrete_consulta',
      subject: '{{paciente_nome}}: consulta {{data}}',
      content: '<p>{{paciente_nome}} às {{horario}} com {{medico_nome}}</p>',
    });

    expect(preview.usedVariables).toEqual(['paciente_nome', 'data', 'horario', 'medico_nome']);
    expect(preview.missingVariables).toEqual([]);
    expect(preview.renderedSubject).toContain('João Silva');
    expect(preview.renderedContent).toContain('14:30');
  });

  it('mantém e destaca placeholders sem valor de exemplo', () => {
    const preview = analyzeTemplatePreview({
      category: 'geral', subject: 'Oi {{nome_fantasma}}', content: '<p>{{nome_fantasma}}</p>',
    });

    expect(preview.missingVariables).toEqual(['nome_fantasma']);
    expect(preview.renderedSubject).toBe('Oi {{nome_fantasma}}');
    expect(preview.renderedContent).toContain('<mark');
    expect(preview.renderedContent).toContain('{{nome_fantasma}}');
  });

  it('marca como ausente variável conhecida mas não fornecida pela categoria', () => {
    const preview = analyzeTemplatePreview({
      category: 'aniversario', subject: 'Feliz aniversário, {{paciente_nome}}', content: 'Consulta em {{data}}',
    });

    expect(preview.missingVariables).toEqual(['data']);
    expect(preview.renderedContent).toContain('template-variable-missing');
  });

  it('não injeta valores de exemplo como HTML ativo', () => {
    const preview = analyzeTemplatePreview({
      category: 'aniversario', subject: '', content: '<p>{{paciente_nome}}</p>',
      values: { paciente_nome: '<img src=x onerror=alert(1)>' },
    });

    expect(preview.renderedContent).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(preview.renderedContent).not.toContain('<img src=x');
  });
});
