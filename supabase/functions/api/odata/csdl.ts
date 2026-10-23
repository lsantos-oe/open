// $metadata (CSDL XML) gerado a partir do modelo — fonte única para OData, OpenAPI e MCP.
import { Complex, type ComplexType, Enums, NS, type Prop } from "./edm.ts";
import { SETS } from "./entities.ts";
import { ACTIONS } from "./actions.ts";

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function propType(pr: Prop): string {
  const base = pr.complex ? `${NS}.${pr.complex.name}` : pr.enum ? `${NS}.${pr.enum.name}` : pr.type;
  return pr.collection ? `Collection(${base})` : base;
}

function annotations(desc?: string, computed?: boolean, nonFilterable?: boolean): string {
  let s = "";
  if (desc) s += `<Annotation Term="Core.Description" String="${x(desc)}"/>`;
  if (computed) s += `<Annotation Term="Core.Computed" Bool="true"/>`;
  if (nonFilterable) s += `<Annotation Term="Core.LongDescription" String="Não filtrável/ordenável (calculada fora do banco)."/>`;
  return s;
}

function complexXml(ct: ComplexType): string {
  const props = ct.props.map((cp) =>
    `<Property Name="${cp.name}" Type="${cp.enum ? `${NS}.${cp.enum.name}` : cp.type}"/>`
  ).join("");
  return `<ComplexType Name="${ct.name}">${props}</ComplexType>`;
}

export function buildCsdl(): string {
  const enums = Object.values(Enums).map((en) =>
    `<EnumType Name="${en.name}" UnderlyingType="Edm.Int32">${
      Object.keys(en.members).map((m, i) => `<Member Name="${m}" Value="${i}"/>`).join("")
    }</EnumType>`
  ).join("");

  const complexes = Object.values(Complex).map(complexXml).join("");

  const types = Object.values(SETS).map((s) => {
    const key = s.props.find((pr) => pr.key)!;
    const props = s.props.map((pr) => {
      const inner = annotations(pr.description, pr.computed, !!pr.post);
      const nullable = pr.nullable === false || pr.collection ? ` Nullable="false"` : "";
      return inner
        ? `<Property Name="${pr.name}" Type="${propType(pr)}"${nullable}>${inner}</Property>`
        : `<Property Name="${pr.name}" Type="${propType(pr)}"${nullable}/>`;
    }).join("");
    const navs = s.navs.map((n) => {
      const t = SETS[n.target].type;
      return `<NavigationProperty Name="${n.name}" Type="${n.many ? `Collection(${NS}.${t})` : `${NS}.${t}`}"/>`;
    }).join("");
    return `<EntityType Name="${s.type}"><Key><PropertyRef Name="${key.name}"/></Key>${props}${navs}${
      annotations(s.description)
    }</EntityType>`;
  }).join("");

  const actions = ACTIONS.map((ac) => {
    const kind = ac.kind === "function" ? "Function" : "Action";
    const bound = ac.boundTo ? ` IsBound="true"` : "";
    const bindingParam = ac.boundTo ? `<Parameter Name="bindingParameter" Type="${NS}.${SETS[ac.boundTo].type}"/>` : "";
    const params = ac.params.map((pa) => `<Parameter Name="${pa.name}" Type="${pa.type}"${pa.required ? ` Nullable="false"` : ""}/>`)
      .join("");
    const ret = ac.returns ? `<ReturnType Type="${ac.returns}"/>` : "";
    return `<${kind} Name="${ac.name}"${bound}>${bindingParam}${params}${ret}${annotations(ac.description)}</${kind}>`;
  }).join("");

  const sets = Object.values(SETS).map((s) => {
    const bindings = s.navs.map((n) => `<NavigationPropertyBinding Path="${n.name}" Target="${n.target}"/>`).join("");
    return `<EntitySet Name="${s.name}" EntityType="${NS}.${s.type}">${bindings}</EntitySet>`;
  }).join("");

  const imports = ACTIONS.filter((a) => !a.boundTo).map((a) =>
    a.kind === "function"
      ? `<FunctionImport Name="${a.name}" Function="${NS}.${a.name}" IncludeInServiceDocument="true"/>`
      : `<ActionImport Name="${a.name}" Action="${NS}.${a.name}"/>`
  ).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
<edmx:Reference Uri="https://oasis-tcs.github.io/odata-vocabularies/vocabularies/Org.OData.Core.V1.xml"><edmx:Include Namespace="Org.OData.Core.V1" Alias="Core"/></edmx:Reference>
<edmx:DataServices>
<Schema Namespace="${NS}" xmlns="http://docs.oasis-open.org/odata/ns/edm">
${enums}${complexes}${types}${actions}
<EntityContainer Name="OpenService">${sets}<Singleton Name="Me" Type="${NS}.User"/>${imports}</EntityContainer>
</Schema>
</edmx:DataServices>
</edmx:Edmx>`;
}
