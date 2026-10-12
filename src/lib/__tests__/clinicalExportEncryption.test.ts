import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { criptografarExportClinico, descriptografarExportClinico } from '../clinicalExportEncryption';

describe('arquivo clínico protegido por senha', () => {
  it('protege e recupera o conteúdo apenas com a senha correta', async () => {
    const envelope = await criptografarExportClinico('{"clinical":"private"}', 'Senha Forte 2026!', webcrypto as unknown as Crypto);

    expect(envelope).not.toContain('private');
    await expect(descriptografarExportClinico(envelope, 'Senha Forte 2026!', webcrypto as unknown as Crypto))
      .resolves.toMatchObject({ conteudo: '{"clinical":"private"}', tipo: 'application/json' });
    await expect(descriptografarExportClinico(envelope, 'senha incorreta', webcrypto as unknown as Crypto))
      .rejects.toThrow();
  });

  it('recusa senhas curtas e envelopes alterados', async () => {
    await expect(criptografarExportClinico('conteúdo', 'curta', webcrypto as unknown as Crypto))
      .rejects.toThrow('12 caracteres');
    const envelope = await criptografarExportClinico('conteúdo', 'Senha Forte 2026!', webcrypto as unknown as Crypto);
    const adulterado = JSON.parse(envelope);
    adulterado.ciphertext = `${adulterado.ciphertext.slice(0, -2)}AA`;
    await expect(descriptografarExportClinico(JSON.stringify(adulterado), 'Senha Forte 2026!', webcrypto as unknown as Crypto))
      .rejects.toThrow();
  });

  it('autentica o tipo e o nome do arquivo dentro do envelope', async () => {
    const envelope = await criptografarExportClinico('<xml/>', 'Senha Forte 2026!', webcrypto as unknown as Crypto, {
      tipo: 'application/xml', nomeArquivo: 'prontuario-sem-pii',
    });
    const adulterado = JSON.parse(envelope);
    adulterado.nomeArquivo = 'arquivo-alterado';

    await expect(descriptografarExportClinico(JSON.stringify(adulterado), 'Senha Forte 2026!', webcrypto as unknown as Crypto))
      .rejects.toThrow();
  });
});
