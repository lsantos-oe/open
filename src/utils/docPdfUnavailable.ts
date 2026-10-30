// Versão do leitor de PDF para onde o pdf.js não roda (função do Discord): avisa em vez de tentar.
export async function pdfToText(_bytes: Uint8Array): Promise<string> {
  throw new Error('Leitura de PDF indisponível aqui.')
}
