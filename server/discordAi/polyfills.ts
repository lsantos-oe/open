// Precisa ser o PRIMEIRO import do runtime: o app grava preferências no localStorage ao criar as stores, e o servidor
// não tem um. Memória simples basta (nada precisa sobreviver entre pedidos).
const memory = new Map<string, string>()
if (typeof (globalThis as { localStorage?: unknown }).localStorage === 'undefined') {
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    get length() { return memory.size },
    clear: () => memory.clear(),
    getItem: (k: string) => memory.get(k) ?? null,
    key: (i: number) => [...memory.keys()][i] ?? null,
    removeItem: (k: string) => { memory.delete(k) },
    setItem: (k: string, v: string) => { memory.set(k, String(v)) },
  }
}
export {}
