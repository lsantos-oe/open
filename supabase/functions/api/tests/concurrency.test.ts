// Concorrência: escritas simultâneas não corrompem dados, não duplicam e não travam (deadlock).
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals } from "@std/assert";
import { api, create, EMAIL, IDS, ignore, uniq } from "./_helpers.ts";

const t = (name: string, fn: () => Promise<void>) => Deno.test({ name: `[concorrência] ${name}`, ignore, fn, sanitizeResources: false, sanitizeOps: false });

t("mesma Idempotency-Key em 8 envios simultâneos → cria uma vez só", async () => {
  const key = `race-${crypto.randomUUID()}`;
  const name = uniq("Idem corrida");
  const body = { ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Name: name, Owners: [{ Email: EMAIL.bruno }] };
  const rs = await Promise.all(Array.from({ length: 8 }, () => api("/Tasks", { headers: { "Idempotency-Key": key }, body })));
  for (const r of rs) assert([201, 409].includes(r.status), `status inesperado ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  assertEquals((await api(`/Tasks/$count?$filter=${encodeURIComponent(`Name eq '${name}'`)}`)).body, 1);
  const again = await api("/Tasks", { headers: { "Idempotency-Key": key }, body });
  assertEquals(again.headers.get("idempotent-replayed"), "true");
});

t("15 criações simultâneas na mesma fase → todas gravam, ordem sem repetição", async () => {
  const p = await create("Projects", { Name: uniq("Proj concorrência"), Pm: { Email: EMAIL.ana }, Phases: [{ Name: "F" }] });
  const phase = (await api(`/Projects(${p.Id})/Phases`)).body.value[0].Id;
  const rs = await Promise.all(Array.from({ length: 15 }, (_, i) => api("/Tasks", { body: { ProjectId: p.Id, PhaseId: phase, Name: `T${i}`, Owners: [{ Email: EMAIL.bruno }] } })));
  for (const r of rs) assertEquals(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const orders = (await api(`/Phases(${phase})/Tasks?$select=Order&$top=50`)).body.value.map((x: any) => x.Order);
  assertEquals(new Set(orders).size, 15);
});

t("cascatas simultâneas no mesmo projeto terminam consistentes (sem deadlock)", async () => {
  const p = await create("Projects", {
    Name: uniq("Proj cascata"),
    Pm: { Email: EMAIL.ana },
    StartDate: "2027-02-01",
    Phases: [{ Name: "F", Tasks: [
      { Ref: "a", Name: "A", DurationDays: 2, Owners: [{ Email: EMAIL.bruno }] },
      { Ref: "b", Name: "B", DurationDays: 2, DependsOn: ["a"], Owners: [{ Email: EMAIL.bruno }] },
      { Ref: "c", Name: "C", DurationDays: 2, DependsOn: ["b"], Owners: [{ Email: EMAIL.bruno }] },
      { Ref: "d", Name: "D", DurationDays: 2, DependsOn: ["c"], Owners: [{ Email: EMAIL.bruno }] },
    ] }],
  });
  const tasks = (await api(`/Projects(${p.Id})/Tasks?$select=Id,Name`)).body.value;
  const id = Object.fromEntries(tasks.map((x: any) => [x.Name, x.Id]));
  const ends = ["2027-02-05", "2027-02-10", "2027-02-04", "2027-02-12", "2027-02-08", "2027-02-03"];
  const rs = await Promise.all([
    ...ends.map((e) => api(`/Tasks(${id.A})/Open.ChangeDates`, { body: { PlannedEnd: e } })),
    // em C muda a duração (sempre válida, qualquer que seja o início que a cascata de A já deu a C)
    ...[1, 3, 2, 4, 2, 5].map((n) => api(`/Tasks(${id.C})/Open.ChangeDates`, { body: { DurationDays: n } })),
  ]);
  for (const r of rs) assertEquals(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  // invariante da cascata: cada tarefa começa no 1º dia útil após o fim da predecessora (ou depois)
  const all = (await api(`/Projects(${p.Id})/Tasks?$select=Name,PlannedStart,PlannedEnd,DependsOn,Id`)).body.value;
  const byId = Object.fromEntries(all.map((x: any) => [x.Id, x]));
  for (const x of all) {
    assert(x.PlannedEnd >= x.PlannedStart, `${x.Name}: fim antes do início`);
    for (const d of x.DependsOn) assert(x.PlannedStart > byId[d].PlannedEnd, `${x.Name} começa antes de ${byId[d].Name} terminar`);
  }
});

t("If-Match em 5 PATCHs simultâneos → exatamente 1 grava, os demais 412", async () => {
  const x = await create("Tasks", { ProjectId: IDS.project, PhaseId: IDS.phaseConfig, Name: uniq("Etag corrida"), Owners: [{ Email: EMAIL.bruno }] });
  const rs = await Promise.all(["None", "Warning", "Critical", "Warning", "Critical"].map((f) =>
    api(`/Tasks(${x.Id})`, { method: "PATCH", headers: { "If-Match": x["@odata.etag"] }, body: { RiskFlag: f } })
  ));
  assertEquals(rs.filter((r) => r.status === 200).length, 1);
  assertEquals(rs.filter((r) => r.status === 412).length, 4);
});

t("intake simultâneo com o mesmo cliente novo → cria 1, os outros reaproveitam (sem duplicar)", async () => {
  const name = uniq("Cliente corrida");
  const rs = await Promise.all(Array.from({ length: 4 }, () => api("/Open.Intake", { body: { DryRun: false, Items: [{ Kind: "Client", Ref: "c", Name: name }] } })));
  for (const r of rs) assertEquals(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const actions = rs.map((r) => r.body.value.Plan[0].Action).sort();
  assertEquals(actions, ["Create", "Reuse", "Reuse", "Reuse"]);
  assertEquals((await api(`/Clients/$count?$filter=${encodeURIComponent(`Name eq '${name}'`)}`)).body, 1);
  // POST /Clients simultâneo com nome igual: 1 cria, os outros recebem 400 de duplicado
  const n2 = uniq("Cliente corrida 2");
  const cs = await Promise.all(Array.from({ length: 4 }, () => api("/Clients", { body: { Name: n2 } })));
  assertEquals(cs.filter((r) => r.status === 201).length, 1);
  assertEquals(cs.filter((r) => r.status === 400).length, 3);
});
