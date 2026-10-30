// Escrita de documentação e grupos de clientes — SQL real num Postgres em memória (PGlite), Storage simulado.
//   deno test -A tests/docs_write.test.ts
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertMatch, assertRejects } from "@std/assert";
import { config } from "../lib/config.ts";
import { setStorage, type StorageApi } from "../lib/storage.ts";
import { isPrivateIp, setNetwork } from "../lib/safefetch.ts";
import { getSet } from "../odata/entities.ts";
import { readCollection, readOne } from "../odata/read.ts";
import { parseOptions } from "../odata/filter.ts";
import * as docs from "../services/docs.ts";
import * as gw from "../services/groups_write.ts";
import { WRITES } from "../odata/actions.ts";
import { A, ATT, C, E, K, newHarness, P } from "./_pglite.ts";

const o = (f: Record<string, string | undefined>) => parseOptions((k) => f[k]);
const b64 = (s: string | Uint8Array) => btoa(typeof s === "string" ? s : String.fromCharCode(...s));

/** Storage em memória: guarda os objetos e devolve links "assinados" fictícios. */
function fakeStorage() {
  const objects = new Map<string, { size: number; type: string }>();
  const impl: StorageApi = {
    upload: (p, bytes, type) => {
      objects.set(p, { size: bytes.byteLength, type });
      return Promise.resolve();
    },
    remove: (ps) => {
      for (const p of ps) objects.delete(p);
      return Promise.resolve();
    },
    signedUrl: (p, exp) => Promise.resolve(`https://storage.fake/sign/${p}?token=t&exp=${exp}`),
    signedUploadUrl: (p) => Promise.resolve(`https://storage.fake/storage/v1/object/upload/sign/project-files/${p}?token=tok`),
    head: (p) => Promise.resolve(objects.has(p) ? { size: objects.get(p)!.size, contentType: objects.get(p)!.type } : null),
  };
  return { objects, impl };
}

const rejectsStatus = async (fn: () => Promise<unknown>, status: number, msg?: string) => {
  const e: any = await assertRejects(fn);
  assertEquals(e.status, status, `status esperado ${status}, veio ${e.status}: ${e.message}`);
  if (msg) assert(String(e.message).includes(msg), `mensagem "${e.message}" não contém "${msg}"`);
};

Deno.test({ name: "[docs/grupos] escrita", sanitizeResources: false, sanitizeOps: false, fn: async (t) => {
  const h = await newHarness();
  const st = fakeStorage();
  setStorage(st.impl);
  const item = (idv: string) => readOne(h.ctx, getSet("DocumentationItems"), idv, {});

  await t.step("link: cria em projeto e em cliente, com código curto, público e etiquetas normalizadas", async () => {
    const a = await h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: " Postman ", Url: "https://x.com/p", Audience: "Technical", Tags: [" API ", "api", "Integração", ""] }));
    const r = await item(a);
    assertEquals([r.Kind, r.Title, r.Audience, r.Source, r.ProjectId, r.ClientId], ["Link", "Postman", "Technical", "Direct", P[0], null]);
    assertEquals(r.Tags, ["API", "Integração"]); // sem repetir (ignora caixa), sem vazias
    assertMatch(String(r.Code), /^D[0-9]{8}$/);
    assertEquals(r.CreatedBy, A);
    const b = await h.run((c) => docs.createDocLink(c, { ClientId: C[1], Title: "Site", Url: "http://cliente.com" }));
    const rb = await item(b);
    assertEquals([rb.Audience, rb.Tags, rb.ClientId, rb.ProjectId], ["Both", [], C[1], null]); // padrão: ambos, sem etiquetas
  });

  await t.step("link: validações claras (escopo, URL, etiquetas, ids)", async () => {
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { Title: "x", Url: "https://x.com" })), 400, "exatamente um");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], ClientId: C[0], Title: "x", Url: "https://x.com" })), 400, "exatamente um");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "javascript:alert(1)" })), 400, "http");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "ftp://x.com/a" })), 400);
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "https://x.com", Tags: Array.from({ length: 13 }, (_, i) => `t${i}`) })), 400, "12");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "https://x.com", Tags: ["a".repeat(31)] })), 400, "30");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "https://x.com", Audience: "Todos" })), 400, "Use um de");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: "00000000-0000-4000-8000-0000000b0099", Title: "x", Url: "https://x.com" })), 400, "Projeto não encontrado");
    await rejectsStatus(() => h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "x", Url: "https://x.com", Extra: 1 })), 400);
  });

  await t.step("link: editar título, URL, público e etiquetas; PATCH vazio não muda nada; Url em texto é recusada", async () => {
    const idv = await h.run((c) => docs.createDocLink(c, { ProjectId: P[1], Title: "Antigo", Url: "https://velho.com", Tags: ["a"] }));
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Title: "Novo", Url: "https://novo.com", Audience: "Executive", Tags: ["b", "c"] }));
    const r = await item(idv);
    assertEquals([r.Title, r.Url, r.Audience, r.Tags], ["Novo", "https://novo.com", "Executive", ["b", "c"]]);
    await h.run((c) => docs.updateDocumentationItem(c, idv, {}));
    assertEquals((await item(idv)).Title, "Novo");
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Tags: [] }));
    assertEquals((await item(idv)).Tags, []);
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, idv, { Body: "x" })), 400, "Text");
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, "00000000-0000-4000-8000-0000000a0099", { Title: "x" })), 404);
  });

  await t.step("link: remover; dry-run não grava nem apaga", async () => {
    const idv = await h.run((c) => docs.createDocLink(c, { ProjectId: P[1], Title: "Apagar", Url: "https://x.com" }));
    await h.run((c) => docs.deleteDocumentationItem(c, idv), { dryRun: true });
    assertEquals((await item(idv)).Title, "Apagar");
    await h.run((c) => docs.deleteDocumentationItem(c, idv));
    await rejectsStatus(() => item(idv) as Promise<unknown>, 404);
    // criação em dry-run: nada fica
    const n = (await h.q("select count(*)::int n from documentation_items"))[0].n;
    await h.run((c) => docs.createDocLink(c, { ProjectId: P[1], Title: "Simulado", Url: "https://x.com" }), { dryRun: true });
    assertEquals((await h.q("select count(*)::int n from documentation_items"))[0].n, n);
  });

  await t.step("espelhados (links/anexos da tarefa): só público e etiquetas, por upsert em documentation_meta", async () => {
    const rows = (await readCollection(h.ctx, getSet("DocumentationItems"), o({ $filter: "Source eq 'Task'", $select: "Id,Kind,Title,Audience,Tags,Code", $top: "20" }))).rows;
    const link = rows.find((r) => r.Kind === "Link")!, file = rows.find((r) => r.Kind === "File")!;
    assertEquals([link.Audience, link.Tags], ["Both", []]);
    await h.run((c) => docs.updateDocumentationItem(c, String(link.Id), { Audience: "Executive", Tags: ["Manual", "manual", "RH"] }));
    const meta = (await h.q("select * from documentation_meta where source_key = $1", [`entry-link:${E[0]}:l1`]))[0];
    assertEquals([meta.audience, meta.tags, meta.updated_by], ["executive", ["Manual", "RH"], A]);
    const again = await item(String(link.Id));
    assertEquals([again.Audience, again.Tags, again.Source, again.Title], ["Executive", ["Manual", "RH"], "Task", "Manual do administrador"]);
    // só uma tag muda: o público é mantido
    await h.run((c) => docs.updateDocumentationItem(c, String(link.Id), { Tags: ["Só"] }));
    assertEquals([(await item(String(link.Id))).Audience, (await item(String(link.Id))).Tags], ["Executive", ["Só"]]);
    // anexo
    await h.run((c) => docs.updateDocumentationItem(c, String(file.Id), { Audience: "Technical" }));
    assertEquals((await h.q("select audience from documentation_meta where source_key = $1", [`entry-file:${ATT}`]))[0].audience, "technical");
    // o conteúdo é da tarefa: título, link e remoção são recusados com a explicação
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, String(link.Id), { Title: "outro" })), 400, "mora na tarefa");
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, String(link.Id), { Url: "https://outro.com" })), 400, "mora na tarefa");
    await rejectsStatus(() => h.run((c) => docs.deleteDocumentationItem(c, String(link.Id))), 400, "tarefa");
    await rejectsStatus(() => h.run((c) => docs.deleteDocumentationItem(c, String(file.Id))), 400, "tarefa");
    // a tarefa que NÃO é de documentação não gera item
    assert(!rows.some((r) => String(r.Title) === "Fora"));
  });

  await t.step("texto: cria com Markdown, substitui o conteúdo via collab_reset, limite de 200 KB", async () => {
    const idv = await h.run((c) => docs.createDocText(c, { ClientId: C[0], Title: "Visão geral", Body: "## Resumo\nTrês funis.", Audience: "Executive", Tags: ["Operação"] }));
    const r = await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "Id,Kind,Body,Audience" }));
    assertEquals([r.Kind, r.Body, r.Audience], ["Text", "## Resumo\nTrês funis.", "Executive"]);
    assertEquals((await h.q("select count(*)::int n from collab_resets"))[0].n, 0); // criar não precisa resetar
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Body: "# Novo\nTudo novo." }));
    assertEquals((await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "Body" }))).Body, "# Novo\nTudo novo.");
    assertEquals((await h.q("select doc_id from collab_resets"))[0].doc_id, `doc_${idv}_body`);
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Body: "" })); // limpar é permitido
    assertEquals((await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "Body" }))).Body, "");
    const big = "a".repeat(200 * 1024 + 1);
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, idv, { Body: big })), 400, "200 KB");
    await rejectsStatus(() => h.run((c) => docs.createDocText(c, { ClientId: C[0], Title: "x", Body: big })), 400, "200 KB");
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Body: "a".repeat(200 * 1024) })); // exatamente no limite passa
    // dry-run: nada muda
    await h.run((c) => docs.updateDocumentationItem(c, idv, { Body: "simulado" }), { dryRun: true });
    assertEquals(String((await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "Body" }))).Body).length, 200 * 1024);
    await rejectsStatus(() => h.run((c) => docs.updateDocumentationItem(c, idv, { Url: "https://x.com" })), 400, "Link");
  });

  await t.step("POST DocumentationItems escolhe o formato pelo Kind", async () => {
    const create = WRITES.DocumentationItems.create!;
    const l = await h.run((c) => create(c, { Kind: "Link", ProjectId: P[0], Title: "L", Url: "https://l.com" }));
    const x = await h.run((c) => create(c, { Kind: "Text", ProjectId: P[0], Title: "T", Body: "oi" }));
    assertEquals([(await item(l)).Kind, (await item(x)).Kind], ["Link", "Text"]);
    await rejectsStatus(() => h.run((c) => create(c, { ProjectId: P[0], Title: "L", Url: "https://l.com" })), 400);
    await rejectsStatus(() => h.run((c) => create(c, { Kind: "Pasta", ProjectId: P[0], Title: "L" })), 400, "Use um de");
  });

  await t.step("arquivo: base64 vai para o Storage em documentation/<escopo>/<id>/<uuid>_<nome>; registro com tamanho", async () => {
    const content = "conteúdo do arquivo";
    const idv = await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "Mapa de campos.xlsx", ContentBase64: b64(unescape(encodeURIComponent(content))), Audience: "Technical", Tags: ["Integração"] }));
    const r = await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "Id,Kind,Title,FileName,FileSize,HasFile,Audience" }));
    assertEquals([r.Kind, r.Title, r.FileName, r.HasFile, r.Audience], ["File", "Mapa de campos.xlsx", "Mapa de campos.xlsx", true, "Technical"]);
    const path = (await h.q("select storage_path from documentation_items where id = $1", [idv]))[0].storage_path as string;
    assertMatch(path, new RegExp(`^documentation/project/${P[0]}/[0-9a-f-]{36}_Mapa_de_campos\\.xlsx$`));
    assertEquals(r.FileSize, new TextEncoder().encode(content).byteLength);
    assertEquals(st.objects.get(path)?.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const cli = await h.run((c) => docs.createDocFile(c, { ClientId: C[0], Title: "Contrato", FileName: "c.pdf", ContentBase64: b64("pdf") }));
    assertMatch((await h.q("select storage_path from documentation_items where id = $1", [cli]))[0].storage_path, new RegExp(`^documentation/client/${C[0]}/`));
    assertEquals((await item(cli)).Title, "Contrato");
  });

  await t.step("arquivo: dry-run não envia nada; falha depois do envio remove o objeto (sem órfão)", async () => {
    const before = st.objects.size, rows = (await h.q("select count(*)::int n from documentation_items"))[0].n;
    await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: b64("x") }), { dryRun: true });
    assertEquals([st.objects.size, (await h.q("select count(*)::int n from documentation_items"))[0].n], [before, rows]);
    await assertRejects(() => h.run(async (c) => {
      await docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: b64("x") });
      assertEquals(st.objects.size, before + 1); // já está no Storage...
      throw new Error("falha depois");
    }));
    assertEquals(st.objects.size, before); // ...e saiu no rollback
  });

  await t.step("arquivo: validações (um de dois, vazio, base64 inválido, tamanho inline, nome, escopo)", async () => {
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf" })), 400, "StoragePath");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: "YQ==", SourceUrl: "https://x.com/a.pdf" })), 400, "uma só");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: "***" })), 400, "base64");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: "" })), 400);
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], ContentBase64: b64("x") })), 400, "FileName");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { FileName: "x.pdf", ContentBase64: b64("x") })), 400, "exatamente um");
    const huge = "A".repeat(Math.ceil((8 * 1024 * 1024 * 4) / 3) + 8);
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.bin", ContentBase64: huge })), 400, "SourceUrl");
  });

  await t.step("arquivo por SourceUrl: baixa, grava e usa o nome da URL; limite de 25 MB", async () => {
    const calls: string[] = [];
    setNetwork(
      () => Promise.resolve(["93.184.216.34"]),
      ((u: URL) => {
        calls.push(String(u));
        const path = u.pathname;
        if (path === "/redir") return Promise.resolve(new Response(null, { status: 302, headers: { location: "https://cdn.exemplo.com/final/relatorio%20anual.pdf" } }));
        if (path === "/redir-interno") return Promise.resolve(new Response(null, { status: 302, headers: { location: "https://127.0.0.1/segredo" } }));
        if (path === "/grande") return Promise.resolve(new Response("x", { headers: { "content-length": String(26 * 1024 * 1024) } }));
        if (path === "/stream-grande") {
          let n = 0;
          return Promise.resolve(new Response(new ReadableStream({ pull(ctl) { if (n++ < 27) ctl.enqueue(new Uint8Array(1024 * 1024)); else ctl.close(); } })));
        }
        if (path === "/404") return Promise.resolve(new Response("nada", { status: 404 }));
        return Promise.resolve(new Response("%PDF-fake", { headers: { "content-type": "application/pdf" } }));
      }) as any,
    );
    try {
      const idv = await h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/redir" }));
      const r = await readOne(h.ctx, getSet("DocumentationItems"), idv, o({ $select: "FileName,FileSize,Title" }));
      assertEquals([r.FileName, r.FileSize], ["relatorio anual.pdf", 9]);
      const path = (await h.q("select storage_path from documentation_items where id = $1", [idv]))[0].storage_path;
      assertEquals(st.objects.get(path)?.type, "application/pdf");
      await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/grande" })), 400, "25 MB");
      await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/stream-grande" })), 400, "25 MB");
      await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/404" })), 400, "HTTP 404");
      // dry-run baixa (valida), mas não envia
      const before = st.objects.size;
      await h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/a.pdf" }), { dryRun: true });
      assertEquals(st.objects.size, before);
      // redirecionamento para destino interno é barrado no salto
      await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ClientId: C[1], SourceUrl: "https://exemplo.com/redir-interno" })), 400, "interno");
      assert(!calls.some((u) => u.includes("127.0.0.1")), "não pode ter feito a requisição para o destino interno");
    } finally {
      setNetwork();
    }
  });

  await t.step("SSRF: só https público (localhost, redes privadas, metadata, credenciais, portas, DNS interno)", async () => {
    let fetched = 0;
    setNetwork(
      (host) => Promise.resolve(host === "interno.exemplo.com" ? ["10.0.0.7"] : host === "misto.exemplo.com" ? ["93.184.216.34", "192.168.1.5"] : host === "v6.exemplo.com" ? ["fd00::1"] : ["93.184.216.34"]),
      (() => {
        fetched++;
        return Promise.resolve(new Response("ok"));
      }) as any,
    );
    try {
      const bad = [
        "http://exemplo.com/a.pdf", "ftp://exemplo.com/a", "https://localhost/a", "https://app.localhost/a", "https://127.0.0.1/a", "https://[::1]/a", "https://10.1.2.3/a",
        "https://172.16.0.9/a", "https://192.168.0.1/a", "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/a", "https://0.0.0.0/a", "https://[::ffff:127.0.0.1]/a",
        "https://[fe80::1]/a", "https://servidor/a", "https://db.internal/a", "https://impressora.local/a", "https://user:senha@exemplo.com/a", "https://exemplo.com:8443/a",
        "https://interno.exemplo.com/a", "https://misto.exemplo.com/a", "https://v6.exemplo.com/a", "nao e url", "file:///etc/passwd",
      ];
      for (const u of bad) await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], SourceUrl: u })), 400);
      assertEquals(fetched, 0, "nenhuma requisição pode ter saído para destinos barrados");
      await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "ok.txt", SourceUrl: "https://exemplo.com/ok" }));
      assertEquals(fetched, 1);
    } finally {
      setNetwork();
    }
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.1.1", "172.31.255.255", "192.168.1.1", "100.100.0.1", "224.0.0.1", "::1", "fc00::1", "fe80::2", "::ffff:10.0.0.1", "::ffff:7f00:1"]) assert(isPrivateIp(ip), ip);
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111"]) assert(!isPrivateIp(ip), ip);
  });

  await t.step("arquivo: remover apaga o registro e (depois do COMMIT) o objeto; dry-run e rollback preservam; mirror recusa", async () => {
    const idv = await h.run((c) => docs.createDocFile(c, { ProjectId: P[1], FileName: "del.pdf", ContentBase64: b64("x") }));
    const path = (await h.q("select storage_path from documentation_items where id = $1", [idv]))[0].storage_path;
    assert(st.objects.has(path));
    await h.run((c) => docs.deleteDocumentationItem(c, idv), { dryRun: true });
    assert(st.objects.has(path), "dry-run não pode apagar o arquivo");
    await assertRejects(() => h.run(async (c) => {
      await docs.deleteDocumentationItem(c, idv);
      throw new Error("falha antes do commit");
    }));
    assert(st.objects.has(path), "rollback não pode apagar o arquivo");
    await h.run((c) => docs.deleteDocumentationItem(c, idv));
    assert(!st.objects.has(path));
    assertEquals((await h.q("select count(*)::int n from documentation_items where id = $1", [idv]))[0].n, 0);
  });

  await t.step("só objetos de documentation/ são apagados do Storage (anexos de tarefa ficam)", async () => {
    st.objects.set("entry/e9/anexo.pdf", { size: 1, type: "x" });
    const [row] = await h.q(`insert into documentation_items (project_id, kind, title, storage_path, file_name) values ($1, 'file', 'Apontando para anexo', 'entry/e9/anexo.pdf', 'anexo.pdf') returning id`, [P[0]]);
    await h.run((c) => docs.deleteDocumentationItem(c, row.id));
    assert(st.objects.has("entry/e9/anexo.pdf"));
  });

  await t.step("link de download: direto e anexo de tarefa; só arquivo; expiração limitada", async () => {
    const idv = await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], Title: "Arq", FileName: "arq.pdf", ContentBase64: b64("abc") }));
    const l = await docs.documentationFileLink(h.ctx, idv);
    assertMatch(l.Url, /^https:\/\/storage\.fake\/sign\/documentation\/project\//);
    assertEquals([l.ExpiresInSeconds, l.FileName, l.FileSize, l.Title], [600, "arq.pdf", 3, "Arq"]);
    assertEquals((await docs.documentationFileLink(h.ctx, idv, { ExpiresInSeconds: 999999 })).ExpiresInSeconds, 3600);
    assertEquals((await docs.documentationFileLink(h.ctx, idv, { ExpiresInSeconds: 5 })).ExpiresInSeconds, 60);
    const anexo = (await readCollection(h.ctx, getSet("DocumentationItems"), o({ $filter: "Source eq 'Task' and Kind eq 'File'", $select: "Id" }))).rows[0];
    const la = await docs.documentationFileLink(h.ctx, String(anexo.Id));
    assertMatch(la.Url, /entry\/e1\/arq\.pdf/);
    assertEquals(la.FileName, "arquitetura.pdf");
    const link = await h.run((c) => docs.createDocLink(c, { ProjectId: P[0], Title: "L", Url: "https://l.com" }));
    await rejectsStatus(() => docs.documentationFileLink(h.ctx, link), 400, "não é um arquivo");
    await rejectsStatus(() => docs.documentationFileLink(h.ctx, "00000000-0000-4000-8000-0000000a0099"), 404);
  });

  // ─── upload direto por URL assinada ───────────────────────────────────────

  const pathOf = (r: { StoragePath: string }) => r.StoragePath;
  /** O que o curl faria: cria o objeto no Storage simulado. */
  const putFile = (path: string, size: number, type = "application/pdf") => st.objects.set(path, { size, type });

  await t.step("request_documentation_upload: caminho do escopo, URL assinada, curl e limites; não grava item nem objeto", async () => {
    config.tokenPepper = "pepper-de-teste";
    const items = (await h.q("select count(*)::int n from documentation_items"))[0].n, objs = st.objects.size;
    const r = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "Relatório final.pdf", Size: 1_500_000 }), { dryRun: true });
    assertMatch(r.StoragePath, new RegExp(`^documentation/project/${P[0]}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_Relatorio_final\\.pdf$`));
    assertEquals([r.Method, r.Headers["Content-Type"], r.MaxBytes, r.Scope], ["PUT", "application/pdf", 25 * 1024 * 1024, { Kind: "Project", Id: P[0] }]);
    assert(r.UploadUrl.includes(r.StoragePath) && r.UploadUrl.includes("token="));
    assertEquals(r.Curl, `curl -sS --fail-with-body -X PUT -H "Content-Type: application/pdf" --data-binary @"<CAMINHO_DO_ARQUIVO_LOCAL>" "${r.UploadUrl}"`);
    assert(r.NextStep.includes("create_documentation_file") && r.NextStep.includes(r.StoragePath));
    assertEquals([(await h.q("select count(*)::int n from documentation_items"))[0].n, st.objects.size], [items, objs]);
    const cli = await h.run((c) => docs.requestDocumentationUpload(c, { ClientId: C[0], FileName: "contrato.docx", ContentType: "application/x-custom" }));
    assertMatch(cli.StoragePath, new RegExp(`^documentation/client/${C[0]}/`));
    assertEquals(cli.Headers["Content-Type"], "application/x-custom");
    assert(r.StoragePath !== (await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "Relatório final.pdf" }))).StoragePath); // cada pedido, um caminho
    await rejectsStatus(() => h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "x.pdf", Size: 26 * 1024 * 1024 })), 400, "25 MB");
    await rejectsStatus(() => h.run((c) => docs.requestDocumentationUpload(c, { FileName: "x.pdf" })), 400, "exatamente um");
    await rejectsStatus(() => h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], ClientId: C[0], FileName: "x.pdf" })), 400, "exatamente um");
    await rejectsStatus(() => h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: "00000000-0000-4000-8000-0000000b0099", FileName: "x.pdf" })), 400, "Projeto não encontrado");
    await rejectsStatus(() => h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0] })), 400);
  });

  await t.step("finalizar com StoragePath: dry-run mostra o item sem gravar e sem apagar o objeto; depois grava com o tamanho real", async () => {
    const r = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "Arquitetura.pdf" }));
    const path = pathOf(r);
    putFile(path, 1_572_864);
    const before = (await h.q("select count(*)::int n from documentation_items"))[0].n;
    const prev = await h.run(async (c) => await readOne(c, getSet("DocumentationItems"), await docs.createDocFile(c, { ProjectId: P[0], StoragePath: path, FileName: "Arquitetura.pdf", Audience: "Technical", Tags: ["API"] }), {}), { dryRun: true });
    assertEquals([prev.FileName, prev.FileSize, prev.ProjectId, prev.Audience], ["Arquitetura.pdf", 1_572_864, P[0], "Technical"]);
    assertEquals((await h.q("select count(*)::int n from documentation_items"))[0].n, before);
    assert(st.objects.has(path), "dry-run não pode apagar o objeto enviado");
    const idv = await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: path, Title: "Arquitetura da integração", Audience: "Technical", Tags: ["API"] }));
    const it = await readOne(h.ctx, getSet("DocumentationItems"), idv, {});
    assertEquals([it.Title, it.FileName, it.FileSize, it.HasFile, it.Kind, it.Tags], ["Arquitetura da integração", "Arquitetura.pdf", 1_572_864, true, "File", ["API"]]);
    assertEquals((await h.q("select storage_path from documentation_items where id = $1", [idv]))[0].storage_path, path);
    assert(st.objects.has(path));
    // o mesmo caminho não vira dois itens
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: path })), 400, "já virou");
    // pelo POST de DocumentationItems (Kind=File), igual
    const r2 = await h.run((c) => docs.requestDocumentationUpload(c, { ClientId: C[1], FileName: "Cliente.xlsx" }));
    putFile(pathOf(r2), 2_200_000);
    const viaPost = await h.run((c) => WRITES.DocumentationItems.create!(c, { Kind: "File", ClientId: C[1], StoragePath: pathOf(r2) }));
    assertEquals((await item(viaPost)).FileSize, 2_200_000);
    // e o download do item gera o link assinado
    assertMatch((await docs.documentationFileLink(h.ctx, idv)).Url, /storage\.fake\/sign\/documentation\/project\//);
  });

  await t.step("finalizar com StoragePath: rejeita outro escopo, prefixo inventado, carimbo de outra pessoa/pepper e origem repetida", async () => {
    const r = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "a.pdf" }));
    putFile(pathOf(r), 1000);
    const ok = pathOf(r);
    const filePart = ok.split("/").pop()!;
    // escopo errado (outro projeto / cliente) mesmo com o objeto existindo
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[1], StoragePath: ok })), 400, "request_documentation_upload");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ClientId: C[0], StoragePath: ok })), 400, "request_documentation_upload");
    // prefixos que não são da documentação, anexos de tarefa, traversal, caminho inventado com o mesmo escopo
    for (const bad of ["entry/e1/arq.pdf", `entry/${filePart}`, `documentation/project/${P[1]}/${filePart}`, `documentation/project/${P[0]}/../${P[1]}/${filePart}`,
      `documentation/project/${P[0]}/${crypto.randomUUID()}_a.pdf`, `documentation/project/${P[0]}/${filePart}/extra`, `/${ok}`, "", " "]) {
      putFile(bad, 10);
      await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: bad })), 400);
    }
    // carimbo é por pessoa: outra pessoa não finaliza o caminho gerado para esta
    const other = { ...h.ctx, user: { ...h.ctx.user, id: "00000000-0000-4000-8000-00000000a002" } } as typeof h.ctx;
    await rejectsStatus(() => docs.createDocFile(other, { ProjectId: P[0], StoragePath: ok }), 400, "gerado");
    // e depende do segredo do servidor
    config.tokenPepper = "outro-pepper";
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: ok })), 400, "gerado");
    config.tokenPepper = "pepper-de-teste";
    // origem: exatamente uma
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: ok, ContentBase64: "YQ==" })), 400, "uma só");
    assert(st.objects.has(ok), "caminho rejeitado por escopo/pessoa não pode ter apagado nada");
    // o caminho correto continua valendo
    assertEquals((await item(await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: ok })))).FileSize, 1000);
  });

  await t.step("finalizar com StoragePath: objeto inexistente, vazio ou maior que 25 MB (o inválido é removido)", async () => {
    const sem = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "nao-enviado.pdf" }));
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(sem) })), 400, "não foi concluído");
    const vazio = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "vazio.pdf" }));
    putFile(pathOf(vazio), 0);
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(vazio) })), 400, "vazio");
    assert(!st.objects.has(pathOf(vazio)));
    const grande = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "grande.zip" }));
    putFile(pathOf(grande), 25 * 1024 * 1024 + 1);
    await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(grande) }), { dryRun: true }).catch(() => {});
    assert(st.objects.has(pathOf(grande)), "em dry-run nada é removido");
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(grande) })), 400, "25 MB");
    assert(!st.objects.has(pathOf(grande)), "objeto acima do limite sai do Storage");
    const limite = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "limite.zip" }));
    putFile(pathOf(limite), 25 * 1024 * 1024);
    assertEquals((await item(await h.run((c) => docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(limite) })))).FileSize, 25 * 1024 * 1024); // exatamente no limite passa
  });

  await t.step("finalizar com StoragePath: se o item não for criado (falha antes do COMMIT), o objeto é removido", async () => {
    const r = await h.run((c) => docs.requestDocumentationUpload(c, { ProjectId: P[0], FileName: "orfao.pdf" }));
    putFile(pathOf(r), 500);
    await assertRejects(() => h.run(async (c) => {
      await docs.createDocFile(c, { ProjectId: P[0], StoragePath: pathOf(r) });
      throw new Error("falha depois");
    }));
    assert(!st.objects.has(pathOf(r)));
  });

  await t.step("cliente do Storage (lib/storage.ts): formato das chamadas à Storage API, com a service role só no servidor", async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
    const realFetch = globalThis.fetch;
    const old = [config.supabaseUrl, config.serviceRoleKey];
    config.supabaseUrl = "https://proj.supabase.co/";
    config.serviceRoleKey = "service-key";
    setStorage(undefined);
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push({ url: String(url), method: String(init.method), headers: init.headers as Record<string, string>, body: init.body as string });
      if (String(url).includes("/object/upload/sign/")) return Promise.resolve(Response.json({ url: "/object/upload/sign/project-files/documentation/project/p/x_a.pdf?token=TKN" }));
      if (init.method === "HEAD") return Promise.resolve(String(url).includes("faltando") ? new Response(null, { status: 404 }) : new Response(null, { headers: { "content-length": "1234", "content-type": "application/pdf" } }));
      return Promise.resolve(Response.json({}));
    }) as any;
    try {
      const { storage } = await import("../lib/storage.ts");
      const up = await storage().signedUploadUrl("documentation/project/p/x_a.pdf");
      assertEquals(up, "https://proj.supabase.co/storage/v1/object/upload/sign/project-files/documentation/project/p/x_a.pdf?token=TKN");
      assertEquals([calls[0].method, calls[0].headers["x-upsert"], calls[0].headers.Authorization], ["POST", "false", "Bearer service-key"]); // sem upsert: não sobrescreve
      assertEquals(await storage().head("documentation/project/p/x_a.pdf"), { size: 1234, contentType: "application/pdf" });
      assertEquals(await storage().head("documentation/project/p/faltando.pdf"), null);
      await assertRejects(() => storage().signedUploadUrl("documentation/../outro"));
    } finally {
      globalThis.fetch = realFetch;
      [config.supabaseUrl, config.serviceRoleKey] = old as [string, string];
      setStorage(st.impl);
    }
  });

  await t.step("sem Storage configurado: erro 503 claro (e nada fica gravado)", async () => {
    setStorage(undefined);
    const n = (await h.q("select count(*)::int n from documentation_items"))[0].n;
    await rejectsStatus(() => h.run((c) => docs.createDocFile(c, { ProjectId: P[0], FileName: "x.pdf", ContentBase64: b64("x") })), 503, "SUPABASE_SERVICE_ROLE_KEY");
    assertEquals((await h.q("select count(*)::int n from documentation_items"))[0].n, n);
    setStorage(st.impl);
  });

  await t.step("tarefa de documentação: IsDocumentation só em tarefas de projeto (schema do PATCH)", async () => {
    const { TaskPatch } = await import("../services/tasks.ts");
    assertEquals(TaskPatch.safeParse({ IsDocumentation: true }).success, true);
    assertEquals(TaskPatch.safeParse({ IsDocumentation: "sim" }).success, false);
  });

  // ─── grupos ───────────────────────────────────────────────────────────────

  const group = (g: string) => readOne(h.ctx, getSet("ClientGroups"), g, {});
  let G = "";

  await t.step("grupo: cria com 2+ clientes e contato direto (materializa o vínculo em todos os clientes)", async () => {
    G = await h.run((c) => gw.createClientGroup(c, { Name: "  Grupo Lockton ", ClientIds: [C[0], C[1]], ContactIds: [K[2]] }));
    const g = await group(G);
    assertEquals([g.Name, g.ClientIds, g.ContactIds, g.ClientCount, g.BelowMinimum, g.CreatedBy], ["Grupo Lockton", [C[0], C[1]], [K[2]], 2, false, A]);
    assertMatch(String(g.Code), /^G[0-9]{8}$/);
    const links = (await h.q("select client_id from contact_clients where contact_id = $1 order by client_id", [K[2]])).map((r) => r.client_id);
    assertEquals(links, [C[0], C[1]]);
  });

  await t.step("grupo: validações (nome único sem diferenciar caixa, mínimo de 2, clientes e contatos existentes, cliente em outro grupo)", async () => {
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "grupo lockton", ClientIds: [C[2], C[3]] })), 409, "Já existe um grupo");
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "Solto", ClientIds: [C[2]] })), 400, "2 clientes");
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "Solto", ClientIds: [C[2], C[2]] })), 400, "2 clientes");
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "Fantasma", ClientIds: [C[2], "00000000-0000-4000-8000-0000000c0099"] })), 400, "não encontrado");
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "Fantasma", ClientIds: [C[2], C[3]], ContactIds: ["00000000-0000-4000-8000-0000000d0099"] })), 400, "ContactId");
    await rejectsStatus(() => h.run((c) => gw.createClientGroup(c, { Name: "Outro", ClientIds: [C[2], C[0]] })), 409, 'já faz parte do grupo "Grupo Lockton"');
    assertEquals((await h.q("select count(*)::int n from client_groups"))[0].n, 1); // nada ficou pela metade
    assertEquals((await h.q("select count(*)::int n from client_group_members where client_id = $1", [C[2]]))[0].n, 0);
  });

  await t.step("grupo: dry-run não grava", async () => {
    await h.run((c) => gw.createClientGroup(c, { Name: "Simulado", ClientIds: [C[2], C[3]] }), { dryRun: true });
    assertEquals((await h.q("select count(*)::int n from client_groups"))[0].n, 1);
  });

  await t.step("grupo: renomear (único), PATCH sem mudança é no-op", async () => {
    const outro = await h.run((c) => gw.createClientGroup(c, { Name: "Acme+Beta", ClientIds: [C[2], C[3]] }));
    await rejectsStatus(() => h.run((c) => gw.updateClientGroup(c, outro, { Name: "GRUPO LOCKTON" })), 409, "Já existe");
    await h.run((c) => gw.updateClientGroup(c, outro, { Name: "Acme e Beta" }));
    assertEquals((await group(outro)).Name, "Acme e Beta");
    await h.run((c) => gw.updateClientGroup(c, outro, { Name: "Acme e Beta" }));
    await h.run((c) => gw.updateClientGroup(c, outro, {}));
    await rejectsStatus(() => h.run((c) => gw.updateClientGroup(c, "00000000-0000-4000-8000-000000090099", { Name: "x" })), 404);
    await h.run((c) => gw.deleteClientGroup(c, outro)); // limpa para os próximos passos
  });

  await t.step("grupo: adicionar/tirar cliente (contatos do grupo acompanham); já em outro grupo = 409; repetir é no-op", async () => {
    await h.run((c) => gw.groupClient(c, G, { ClientId: C[2] }, true));
    assertEquals((await group(G)).ClientIds, [C[0], C[1], C[2]]);
    assert((await h.q("select 1 from contact_clients where contact_id = $1 and client_id = $2", [K[2], C[2]])).length === 1); // contato direto chegou ao novo cliente
    await h.run((c) => gw.groupClient(c, G, { ClientId: C[2] }, true)); // de novo: nada muda
    assertEquals((await group(G)).ClientCount, 3);
    await h.run((c) => gw.groupClient(c, G, { ClientId: C[2] }, false));
    assertEquals((await group(G)).ClientIds, [C[0], C[1]]);
    assertEquals((await h.q("select 1 from contact_clients where contact_id = $1 and client_id = $2", [K[2], C[2]])).length, 0); // vínculo criado pelo grupo foi solto
    await rejectsStatus(() => h.run((c) => gw.groupClient(c, G, { ClientId: "00000000-0000-4000-8000-0000000c0099" }, true)), 400, "Cliente não encontrado");
  });

  await t.step("grupo: um cliente em outro grupo é recusado; allowMultipleClientGroups libera", async () => {
    const g2 = await h.run((c) => gw.createClientGroup(c, { Name: "Acme+Beta", ClientIds: [C[2], C[3]] }));
    await rejectsStatus(() => h.run((c) => gw.groupClient(c, g2, { ClientId: C[0] }, true)), 409, 'já faz parte do grupo "Grupo Lockton"');
    await h.q(`insert into settings (key, value) values ('config', '{"allowMultipleClientGroups": true}')`);
    await h.run((c) => gw.groupClient(c, g2, { ClientId: C[0] }, true));
    assertEquals(((await group(g2)).ClientIds as string[]).includes(C[0]), true);
    await h.run((c) => gw.groupClient(c, g2, { ClientId: C[0] }, false));
    await h.q(`delete from settings where key = 'config'`);
    await h.run((c) => gw.deleteClientGroup(c, g2));
  });

  await t.step("grupo: contato direto — adiciona (liga a todos os clientes), tira (solta só o que o grupo criou)", async () => {
    // K[0] já estava ligado à mão ao C[0]: o grupo não pode apagar esse vínculo ao soltar
    await h.run((c) => gw.groupContact(c, G, { ContactId: K[0] }, true));
    assertEquals((await h.q("select client_id from contact_clients where contact_id = $1 order by client_id", [K[0]])).map((r) => r.client_id), [C[0], C[1]]);
    await h.run((c) => gw.groupContact(c, G, { ContactId: K[0] }, true)); // repetir não duplica
    assertEquals((await group(G)).ContactIds, [K[2], K[0]]);
    await h.run((c) => gw.groupContact(c, G, { ContactId: K[0] }, false));
    assertEquals((await h.q("select client_id from contact_clients where contact_id = $1", [K[0]])).map((r) => r.client_id), [C[0]]); // o manual ficou
    await rejectsStatus(() => h.run((c) => gw.groupContact(c, G, { ContactId: "00000000-0000-4000-8000-0000000d0099" }, true)), 400, "Contato não encontrado");
    await rejectsStatus(() => h.run((c) => gw.groupContact(c, G, { ContactId: "x" }, true)), 400);
  });

  await t.step("grupo: tirar clientes até sobrar menos de 2 mantém o grupo (só avisa)", async () => {
    await h.run((c) => gw.groupClient(c, G, { ClientId: C[1] }, false));
    const g = await group(G);
    assertEquals([g.ClientCount, g.BelowMinimum], [1, true]);
    await h.run((c) => gw.groupClient(c, G, { ClientId: C[1] }, true));
  });

  await t.step("grupo: desfazer solta os vínculos que criou e mantém clientes e contatos; dry-run não desfaz", async () => {
    await h.run((c) => gw.deleteClientGroup(c, G), { dryRun: true });
    assertEquals((await group(G)).Name, "Grupo Lockton");
    await h.run((c) => gw.deleteClientGroup(c, G));
    assertEquals((await h.q("select count(*)::int n from client_groups"))[0].n, 0);
    assertEquals((await h.q("select count(*)::int n from clients"))[0].n, 4);
    assertEquals((await h.q("select count(*)::int n from contacts"))[0].n, 3);
    assertEquals((await h.q("select count(*)::int n from contact_clients where contact_id = $1", [K[2]]))[0].n, 0); // o contato do grupo perdeu os vínculos que o grupo criou
    assertEquals((await h.q("select count(*)::int n from contact_clients where contact_id = $1", [K[0]]))[0].n, 1); // o manual continua
    await rejectsStatus(() => h.run((c) => gw.deleteClientGroup(c, G)), 404);
  });

  setStorage(undefined);
}});
