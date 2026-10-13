// Fila única para toda chamada do assistente ao Supabase (histórico, memórias e a leitura da sessão que o chat faz
// antes de falar com o modelo). O supabase-js disputa o lock da sessão (gotrue) quando várias chamadas começam ao
// mesmo tempo, e a disputa faz chamadas REJEITAREM ("lock stolen by another request") — por isso o app inteiro
// carrega em sequência (ver App.tsx). Aqui vale o mesmo: uma de cada vez, na ordem em que foram pedidas.
//
// Só as chamadas "folha" entram na fila. Uma função que enfileira e, dentro dela, enfileira outra travaria.

let tail: Promise<unknown> = Promise.resolve()

export function aiQueue<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job)
  tail = run.catch(() => undefined)
  return run
}

/** Resolve quando tudo que já foi enfileirado terminou. */
export function aiQueueIdle(): Promise<void> {
  return tail.then(() => undefined, () => undefined)
}
