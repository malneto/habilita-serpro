/* Habilita — busca na documentação de habilitação do Serpro.
   Busca, voz e kit rodam no navegador (índice estático dados.json + MiniSearch + reconhecimento de voz
   do próprio navegador): custo zero. A pergunta com IA usa um servidor só no dia do teste. */
"use strict";

const $ = (s) => document.querySelector(s);
const conteudo = $("#conteudo");
const campo = $("#q");
const API = "https://habilita-api.vercel.app";
const IA_ATE = new Date("2026-10-30T03:00:00Z");      // meia-noite de 29/10 (Brasília): depois disso, sem IA
const CELULAR = matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 820;

let DADOS = null, BUSCA = null, PORID = {};
let filtros = { categoria: "", uf: "", situacao: "" };
let tela = "busca";                                     // "busca" | "kit"
let ia = { ligada: false, pergunta: "", carregando: false, resposta: null, erro: "" };
const kit = new Set(JSON.parse(sessionStorage.getItem("kit") || "[]"));

// ---------- texto ----------
const base = (s) => Array.from(String(s || "")).map((c) => c.normalize("NFD")[0]).join("").toLowerCase(); // mesmo tamanho do original
const PARADAS = new Set("a o os as de da do das dos e em no na nos nas para pra pro por com que qual quais onde esta este essa esse eu me minha meu um uma uns umas preciso quero queria gostaria favor ver achar encontrar mostrar mostra documento documentos arquivo arquivos sobre tem tenho do serpro voces voce pode podem".split(" "));
const SINONIMOS = {
  fgts: "crf caixa regularidade", crf: "fgts caixa", caixa: "fgts crf",
  trabalhista: "cndt tst trabalhistas", trabalhistas: "cndt tst", tst: "trabalhista cndt", cndt: "trabalhista tst",
  federal: "srfb inss pgfn receita conjunta", receita: "federal srfb rfb", inss: "federal previdenciaria", pgfn: "federal divida ativa uniao",
  divida: "pgfn cadin ativa", ativa: "divida pgfn",
  falencia: "falencias recuperacao judicial tjdft concordata", recuperacao: "falencia judicial", concordata: "falencia recuperacao",
  estatuto: "estatuto social", contrato: "estatuto social", social: "estatuto capital",
  balanco: "balancos dre patrimonial capital demonstracao", dre: "balanco demonstracao resultado", demonstracao: "dre balanco", contabil: "balanco dre",
  faturamento: "receita bruta", inidoneo: "tcu inidoneos licitantes", inidoneidade: "tcu inidoneos", licitante: "tcu licitantes", tcu: "inidoneos consulta consolidada",
  imunidade: "imune tributaria ato declaratorio", junta: "comercial breve relato", comercial: "junta", breve: "relato junta",
  cnpj: "inscricao cadastral cartao", cartao: "cnpj inscricao", inscricao: "cnpj",
  sicaf: "cadastramento fornecedores credenciado", fornecedor: "sicaf", cadastro: "sicaf cadastrais",
  municipal: "municipio prefeitura iss", prefeitura: "municipal", iss: "municipal", estadual: "estado icms sefaz", icms: "estadual", sefaz: "estadual",
  lei: "leis criacao", leis: "lei criacao", criacao: "lei", menor: "menores declaracao", menores: "declaracao menor",
  infantil: "menores menor declaracao contratacao", crianca: "menores menor declaracao", adolescente: "menores menor declaracao", aprendiz: "menores declaracao",
  negativa: "certidao", cnd: "certidao negativa", regularidade: "certidao regular", vencimento: "validade tabela", validade: "vencimento",
  cadin: "cadin", cadastral: "cadastrais dados", dados: "cadastrais",
};
const ordenar = (t) => t.split("").sort().join("");
const SIGLAS_CONHECIDAS = Object.keys(SINONIMOS).filter((k) => k.length <= 6);
const corrigir = (t) => (SINONIMOS[t] || t.length < 3 || t.length > 6) ? t : SIGLAS_CONHECIDAS.find((k) => k.length === t.length && ordenar(k) === ordenar(t)) || t;
const termos = (q) => base(q).split(/[^a-z0-9]+/).filter((t) => t && !PARADAS.has(t)).map(corrigir);

const UFS = {
  AC: ["Acre", "Rio Branco"], AL: ["Alagoas", "Maceió"], AP: ["Amapá", "Macapá"], AM: ["Amazonas", "Manaus"], BA: ["Bahia", "Salvador"],
  CE: ["Ceará", "Fortaleza"], DF: ["Distrito Federal", "Brasília"], ES: ["Espírito Santo", "Vitória"], GO: ["Goiás", "Goiânia"],
  MA: ["Maranhão", "São Luís"], MT: ["Mato Grosso", "Cuiabá"], MS: ["Mato Grosso do Sul", "Campo Grande"], MG: ["Minas Gerais", "Belo Horizonte"],
  PA: ["Pará", "Belém"], PB: ["Paraíba", "João Pessoa"], PR: ["Paraná", "Curitiba"], PE: ["Pernambuco", "Recife"], PI: ["Piauí", "Teresina"],
  RJ: ["Rio de Janeiro", "Rio de Janeiro"], RN: ["Rio Grande do Norte", "Natal"], RS: ["Rio Grande do Sul", "Porto Alegre"], RO: ["Rondônia", "Porto Velho"],
  RR: ["Roraima", "Boa Vista"], SC: ["Santa Catarina", "Florianópolis"], SP: ["São Paulo", "São Paulo"], SE: ["Sergipe", "Aracaju"], TO: ["Tocantins", "Palmas"],
};
const SIGLA_SEGURA = new Set("pe pb pr pi rj rn rs ro rr sc sp df mg ms mt ce ba go".split(" "));
function ufNaFrase(original) {
  const t = " " + base(original).replace(/[^a-z0-9]+/g, " ") + " ";
  const nomes = [];
  for (const [uf, [estado, capital]] of Object.entries(UFS)) nomes.push([base(estado), uf], [base(capital), uf]);
  nomes.sort((a, b) => b[0].length - a[0].length);
  for (const [nome, uf] of nomes) if (t.includes(" " + nome + " ")) return uf;
  for (const palavra of String(original).split(/[^A-Za-zÀ-ú]+/)) {
    const p = palavra.toUpperCase();
    if (UFS[p] && (palavra === p || SIGLA_SEGURA.has(palavra.toLowerCase()))) return p;
  }
  return "";
}

// ---------- validade ----------
const HOJE = new Date(new Date().toDateString());
function situacao(d) {
  if (!d.validade) return null;
  const ate = new Date(d.validade.ate + "T00:00:00");
  const dias = Math.round((ate - HOJE) / 864e5);
  const data = ate.toLocaleDateString("pt-BR");
  const fonte = d.validade.fonte === "documento" ? "data lida no próprio documento" : "data da tabela de vencimentos da pasta";
  if (dias < 0) return { tipo: "vencida", texto: `Vencida em ${data}`, fonte, dias };
  if (dias <= 15) return { tipo: "vence", texto: dias === 0 ? "Vence hoje" : `Vence em ${dias} dia${dias > 1 ? "s" : ""} (${data})`, fonte, dias };
  return { tipo: "ok", texto: `Válida até ${data}`, fonte, dias };
}

// ---------- registro anônimo das buscas (melhora sinônimos e mostra o que falta) ----------
function registrar(evento) {
  try {
    fetch(API + "/api/registrar", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...evento, celular: CELULAR }) }).catch(() => {});
  } catch {}
}
let ultimaRegistrada = "";
function registrarBusca(voz = false) {
  const q = campo.value.trim();
  if (q.length < 2 || q === ultimaRegistrada) return;
  ultimaRegistrada = q;
  registrar({ tipo: "busca", q, resultados: resultados().length, voz });
}

// ---------- carga ----------
async function iniciar() {
  try {
    DADOS = await (await fetch("dados.json", { cache: "no-cache" })).json();
  } catch {
    conteudo.innerHTML = `<p class="vazio">Não consegui carregar os documentos. Verifique a conexão e recarregue.</p>`;
    return;
  }
  const catPorId = Object.fromEntries(DADOS.categorias.map((c) => [c.id, c]));
  DADOS.documentos.forEach((d) => {
    d.cat = catPorId[d.categoria] || { nome: d.categoria, icone: "📄" };
    d.local = [d.cidade, d.uf && UFS[d.uf] ? `${UFS[d.uf][0]} ${d.uf}` : ""].filter(Boolean).join(" · ");
    d.sit = situacao(d);
    PORID[d.id] = d;
  });
  BUSCA = new MiniSearch({
    idField: "id",
    fields: ["titulo", "categoriaTexto", "local", "pastasTexto", "texto"],
    extractField: (d, f) => f === "categoriaTexto" ? `${d.cat.nome} ${d.cat.descricao || ""}` : f === "pastasTexto" ? d.pastas.join(" ") : d[f] || "",
    processTerm: (t) => { const b = base(t); return b.length < 2 ? null : b; },
    searchOptions: { boost: { titulo: 4, categoriaTexto: 3, local: 3, pastasTexto: 2, texto: 1 }, prefix: (t) => t.length > 2, fuzzy: (t) => (t.length > 4 ? 0.2 : false) },
  });
  BUSCA.addAll(DADOS.documentos);

  $("#linkFonte").href = DADOS.fonte.url;
  const quando = new Date(DADOS.geradoEm);
  $("#metaTopo").innerHTML = `${DADOS.documentos.length} documentos · conferido em ${quando.toLocaleDateString("pt-BR")} às ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const atalhos = [["Certidão federal", "certidão federal"], ["FGTS", "FGTS"], ["Trabalhista", "certidão trabalhista"], ["SICAF", "SICAF"], ["Estatuto", "estatuto social"], ["Balanço e DRE", "balanço DRE"], ["CNPJ", "CNPJ"], ["Falência", "falência"], ["TCU", "TCU"]];
  $("#atalhos").innerHTML = atalhos.map(([r, q]) => `<button class="atalho" data-q="${q}">${r}</button>`).join("");
  $("#atalhos").onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) { campo.value = b.dataset.q; confirmarBusca(); } };

  const p = new URLSearchParams(location.search);
  campo.value = p.get("q") || "";
  filtros = { categoria: p.get("cat") || "", uf: p.get("uf") || "", situacao: p.get("sit") || "" };
  atualizarKit();
  desenhar();
  verificarIA();
}

// IA só no dia do teste: o servidor confirma (e recusa sozinho depois da meia-noite)
async function verificarIA() {
  if (Date.now() >= IA_ATE.getTime()) return;
  try {
    const e = await (await fetch(API + "/api/estado", { cache: "no-store" })).json();
    ia.ligada = Boolean(e.ia) && Date.now() < IA_ATE.getTime();
    if (ia.ligada) desenhar();
  } catch {}
}

// ---------- busca ----------
function resultados() {
  const q = campo.value.trim();
  let lista;
  if (q) {
    const ts = termos(q);
    const extra = ts.flatMap((t) => (SINONIMOS[t] || "").split(" ")).filter(Boolean);
    const uf = filtros.uf ? "" : ufNaFrase(q);
    lista = BUSCA.search([...ts, ...extra].join(" ") || q, {
      combineWith: "OR",
      boostDocument: (id) => {
        const d = PORID[id];
        let b = 1;
        if (uf) b *= d.uf === uf ? 4 : 0.35;
        if (ts.some((t) => base(d.titulo).includes(t))) b *= 1.3;
        return b;
      },
    }).map((r) => ({ ...PORID[r.id], score: r.score, achados: r.terms }));
    if (lista.length) { const topo = lista[0].score; lista = lista.filter((r) => r.score >= topo * 0.12); }
  } else {
    lista = DADOS.documentos.slice();
  }
  if (filtros.categoria) lista = lista.filter((d) => d.categoria === filtros.categoria);
  if (filtros.uf) lista = lista.filter((d) => d.uf === filtros.uf);
  if (filtros.situacao) lista = lista.filter((d) => d.sit && d.sit.tipo === filtros.situacao);
  if (!q && filtros.situacao) lista.sort((a, b) => a.sit.dias - b.sit.dias);
  return lista;
}

// busca "confirmada" (Enter, voz, atalho): rola até os resultados, registra e, se for pergunta longa, chama a IA (só hoje)
function confirmarBusca(voz = false) {
  tela = "busca";
  desenhar();
  registrarBusca(voz);
  const q = campo.value.trim();
  if (ia.ligada && q.split(/\s+/).length >= 4 && ia.pergunta !== q) perguntarIA(q);
  conteudo.scrollIntoView({ behavior: "smooth", block: "start" });
}

function guardarEndereco() {
  const p = new URLSearchParams();
  if (campo.value.trim()) p.set("q", campo.value.trim());
  if (filtros.categoria) p.set("cat", filtros.categoria);
  if (filtros.uf) p.set("uf", filtros.uf);
  if (filtros.situacao) p.set("sit", filtros.situacao);
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
}

// ---------- IA (só no dia do teste) ----------
async function perguntarIA(q) {
  if (!ia.ligada || Date.now() >= IA_ATE.getTime()) return;
  ia = { ...ia, pergunta: q, carregando: true, resposta: null, erro: "" };
  desenhar();
  try {
    const candidatos = resultados().slice(0, 5).map((d) => d.id);
    const r = await fetch(API + "/api/perguntar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pergunta: q, candidatos }) });
    const j = await r.json();
    if (r.status === 410 || r.status === 429) ia.ligada = false;
    ia = { ...ia, carregando: false, resposta: j.ok ? j : null, erro: j.ok ? "" : j.error || "A IA não respondeu." };
  } catch {
    ia = { ...ia, carregando: false, erro: "A IA não respondeu agora. Use a busca abaixo." };
  }
  if (campo.value.trim() === q) desenhar();
}

function cartaoIA(q) {
  if (!ia.ligada && !ia.resposta) return "";
  if (ia.pergunta !== q) {
    return `<section class="ia-chamada"><button class="btn ia" data-ia="1">✨ Perguntar à IA: “${esc(q)}”</button><span class="meta">IA disponível só hoje, no teste</span></section>`;
  }
  if (ia.carregando) return `<section class="ia-cartao carregando-ia"><p>✨ A IA está lendo os documentos…</p></section>`;
  if (ia.erro) return `<section class="ia-cartao"><p class="meta">✨ ${esc(ia.erro)}</p></section>`;
  const r = ia.resposta;
  if (!r) return "";
  const docs = r.documentos.map((x) => ({ ...PORID[x.id], motivo: x.motivo })).filter((d) => d.id);
  return `<section class="ia-cartao">
    <p class="ia-rotulo">✨ Resposta da IA <span class="meta">· teste de hoje</span></p>
    <p class="ia-texto">${esc(r.resposta)}</p>
    ${docs.length ? `<ul class="ia-docs">${docs.map((d) => `<li>
      <a href="${d.ver || d.urlExterna || d.download}" target="_blank" rel="noopener" data-abrir="${d.id}"><b>${esc(d.titulo)}</b></a>
      ${d.sit ? `<span class="selo ${d.sit.tipo}">${esc(d.sit.texto)}</span>` : ""}<span class="meta"> — ${esc(d.motivo)}</span></li>`).join("")}</ul>
      <button class="btn amarelo" data-kit-todos="${docs.map((d) => d.id).join(",")}">＋ Pôr os ${docs.length} no kit</button>` : ""}
  </section>`;
}

// ---------- kit da licitação (regras, sem IA) ----------
function locaisDoKit() {
  const m = new Map();
  DADOS.documentos.forEach((d) => { if (d.cidade && d.uf && !/sede/i.test(d.cidade)) m.set(`${d.cidade}|${d.uf}`, { cidade: d.cidade, uf: d.uf }); });
  return [...m.values()].sort((a, b) => a.uf.localeCompare(b.uf) || a.cidade.localeCompare(b.cidade));
}
function montarKit(cidade, uf) {
  const docs = DADOS.documentos;
  const daCat = (trecho) => docs.filter((d) => d.categoria.includes(trecho));
  const melhor = (lista) => lista.find((d) => d.cidade === cidade) || lista.find((d) => d.uf === uf) || null;
  const ids = [
    melhor(daCat("SICAF")) || daCat("SICAF").find((d) => /sede/i.test(d.titulo)),
    ...daCat("FEDERAL"), ...daCat("FGTS"), ...daCat("TRABALHISTA"), ...daCat("FALENCIA"), ...daCat("CADIN"),
    ...daCat("ESTADUAL").filter((d) => d.uf === uf),
    ...daCat("MUNICIPAL").filter((d) => d.cidade === cidade || (/sede/i.test(cidade) && d.uf === uf)),
    melhor(daCat("CNPJ")),
    ...daCat("ESTATUTO"), ...daCat("DRE"),
  ].filter(Boolean).filter((d) => d.tipo !== "url").map((d) => d.id);
  kit.clear(); ids.forEach((id) => kit.add(id));
  atualizarKit();
  registrar({ tipo: "kit", q: `${cidade}/${uf}`, resultados: ids.length });
  tela = "kit"; desenhar();
  conteudo.scrollIntoView({ behavior: "smooth", block: "start" });
}

function telaKit() {
  const docs = [...kit].map((id) => PORID[id]).filter(Boolean);
  const n = (t) => docs.filter((d) => d.sit && d.sit.tipo === t).length;
  return `<section class="kit-topo">
    <div><h2>Seu kit · ${docs.length} documento${docs.length !== 1 ? "s" : ""}</h2>
      <p class="meta">${n("ok")} válido(s) · ${n("vence")} vencendo · ${n("vencida")} vencido(s)</p></div>
    <div class="acoes">
      <button class="btn primario" id="kitBaixar">⬇ Baixar todos</button>
      <button class="btn" id="kitCopiar">Copiar links</button>
      <a class="btn" href="https://wa.me/?text=${encodeURIComponent(textoKit(docs))}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn" href="mailto:?subject=${encodeURIComponent("Documentos de habilitação do Serpro")}&body=${encodeURIComponent(textoKit(docs))}">E-mail</a>
      <button class="btn" id="voltar">Início</button>
    </div>
  </section>
  ${n("vencida") ? `<p class="alerta">⚠ Há documento vencido no kit. Confira antes de enviar.</p>` : ""}
  <section class="lista">${docs.length ? docs.map(cartao).join("") : `<p class="vazio">O kit está vazio. Toque em <b>+</b> nos documentos para juntar aqui.</p>`}</section>`;
}
const textoKit = (docs) => `Documentos de habilitação do Serpro:\n${docs.map((d) => `• ${d.titulo}${d.sit ? ` (${d.sit.texto.toLowerCase()})` : ""}\n  ${d.urlExterna || d.download}`).join("\n")}`;

// "documentos para licitação em Natal": pedido de kit + local → oferece o kit pronto (sem IA)
function kitNaFrase(q) {
  if (!/licita|kit|contrata|habilita|pregao|todos os documentos|documentacao completa|documentos necessarios/.test(base(q))) return null;
  const locais = locaisDoKit();
  const t = " " + base(q).replace(/[^a-z0-9]+/g, " ") + " ";
  const cidade = locais.slice().sort((a, b) => b.cidade.length - a.cidade.length).find((l) => t.includes(" " + base(l.cidade) + " "));
  if (cidade) return cidade;
  const uf = ufNaFrase(q);
  if (!uf) return null;
  return locais.find((l) => l.uf === uf && base(l.cidade) === base(UFS[uf][1])) || locais.find((l) => l.uf === uf) || null;
}

// ---------- desenho ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function trecho(d, achados) {
  const texto = (d.texto || "").replace(/\s+/g, " ");
  if (!texto || !achados?.length) return "";
  const b = base(texto);
  let pos = -1;
  for (const t of achados) { const i = b.indexOf(t); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if (pos < 0) return "";
  const ini = Math.max(0, pos - 70), fim = Math.min(texto.length, pos + 170);
  const orig = texto.slice(ini, fim), pb = base(orig);
  const marcas = [];
  for (const t of new Set(achados)) { let i = pb.indexOf(t); while (i >= 0) { marcas.push([i, i + t.length]); i = pb.indexOf(t, i + t.length); } }
  let out = "", cur = 0;
  marcas.sort((a, b) => a[0] - b[0]).forEach(([a, z]) => { if (a < cur) return; out += esc(orig.slice(cur, a)) + "<mark>" + esc(orig.slice(a, z)) + "</mark>"; cur = z; });
  out += esc(orig.slice(cur));
  return `${ini > 0 ? "…" : ""}${out}${fim < texto.length ? "…" : ""}`;
}

function cartao(d) {
  const sit = d.sit;
  const ver = d.ver || d.urlExterna || d.download;
  const icone = d.tipo === "url" ? "🔗" : d.tipo === "xlsx" ? "📊" : d.cat.icone;
  const mini = d.miniatura ? `<img src="${d.miniatura}" alt="" loading="lazy">` : `<span>${icone}</span>`;
  const noKit = kit.has(d.id);
  return `<article class="doc ${noKit ? "no-kit" : ""}" data-id="${d.id}">
    <a class="mini" href="${ver}" target="_blank" rel="noopener" data-abrir="${d.id}" aria-label="Ver ${esc(d.titulo)}">${mini}</a>
    <div class="doc-corpo">
      <h3>${esc(d.titulo)}</h3>
      <p class="trilha">${d.pastas.map(esc).join(" › ")}</p>
      <div class="selos">
        <span class="selo">${d.cat.icone} ${esc(d.cat.nome)}</span>
        ${d.local ? `<span class="selo">📍 ${esc(d.local)}</span>` : ""}
        ${sit ? `<span class="selo ${sit.tipo}" title="${esc(sit.fonte)}">${sit.tipo === "ok" ? "✓" : sit.tipo === "vence" ? "⏳" : "⚠"} ${esc(sit.texto)}</span>` : ""}
      </div>
      ${d.achados ? `<p class="trecho">${trecho(d, d.achados)}</p>` : ""}
      <div class="acoes">
        ${d.tipo === "url" ? `<a class="btn primario" href="${esc(d.urlExterna)}" target="_blank" rel="noopener" data-abrir="${d.id}">Abrir link</a>`
          : `<a class="btn primario" href="${ver}" target="_blank" rel="noopener" data-abrir="${d.id}">Ver</a><a class="btn" href="${d.download}" data-abrir="${d.id}">Baixar</a>`}
        <button class="btn" data-copiar="${d.id}">Copiar link</button>
      </div>
    </div>
    <button class="marcar" data-kit="${d.id}" aria-pressed="${noKit}" aria-label="${noKit ? "Tirar do kit" : "Pôr no kit"}" title="${noKit ? "Tirar do kit" : "Pôr no kit"}">${noKit ? "✓" : "+"}</button>
  </article>`;
}

function inicio() {
  const docs = DADOS.documentos;
  const com = docs.filter((d) => d.sit);
  const n = (t) => com.filter((d) => d.sit.tipo === t).length;
  const recentes = docs.slice().sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm)).slice(0, 8);
  const ufs = Object.keys(UFS).filter((uf) => docs.some((d) => d.uf === uf));
  const locais = locaisDoKit();
  return `
  <section class="kit-montar">
    <div class="kit-montar-texto">
      <h2>🧰 Monte o kit da licitação</h2>
      <p>Escolha a cidade da contratação e o Habilita junta SICAF, certidões federal, FGTS, trabalhista, falência, estadual, municipal, CNPJ, estatuto e balanço.</p>
    </div>
    <div class="kit-montar-campo">
      <label class="so-leitor" for="localKit">Cidade da contratação</label>
      <select id="localKit"><option value="">Escolha a cidade…</option>${["", ...Object.keys(UFS)].filter((uf) => locais.some((l) => l.uf === uf)).map((uf) => `<optgroup label="${UFS[uf][0]}">${locais.filter((l) => l.uf === uf).map((l) => `<option value="${esc(l.cidade)}|${l.uf}">${esc(l.cidade)} — ${l.uf}</option>`).join("")}</optgroup>`).join("")}<option value="Brasília (sede)|DF">Sede — Brasília/DF</option></select>
      <button class="btn amarelo" id="montarKit">Montar kit</button>
    </div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Situação das certidões</h2><span class="meta">${com.length} com validade</span></div>
    <div class="situacao">
      <button class="tile ok" data-sit="ok"><strong>${n("ok")}</strong><span>válidas</span></button>
      <button class="tile vence" data-sit="vence"><strong>${n("vence")}</strong><span>vencem em até 15 dias</span></button>
      <button class="tile vencida" data-sit="vencida"><strong>${n("vencida")}</strong><span>vencidas</span></button>
    </div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Chegou agora</h2><span class="meta">últimos atualizados</span></div>
    <div class="recentes">${recentes.map((d) => `<a class="recente" href="${d.ver || d.urlExterna || d.download}" target="_blank" rel="noopener" data-abrir="${d.id}">
      ${d.miniatura ? `<img src="${d.miniatura}" alt="" loading="lazy">` : `<span class="sem-mini">${d.tipo === "xlsx" ? "📊" : "📄"}</span>`}
      <div><b>${esc(d.titulo)}</b><span class="meta">${new Date(d.modificadoEm).toLocaleDateString("pt-BR")}</span></div></a>`).join("")}</div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Navegue por tipo</h2></div>
    <div class="categorias">${DADOS.categorias.map((c) => `<button class="categoria" data-cat="${esc(c.id)}">
      <span class="emoji">${c.icone}</span><span><b>${esc(c.nome)}</b><small>${c.total} documento${c.total > 1 ? "s" : ""}${c.descricao ? " · " + esc(c.descricao) : ""}</small></span></button>`).join("")}</div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Por estado</h2><span class="meta">SICAF, certidões estaduais e municipais, CNPJ</span></div>
    <div class="estados">${ufs.map((uf) => `<button class="uf" data-uf="${uf}" title="${UFS[uf][0]}">${uf}<small>${docs.filter((d) => d.uf === uf).length}</small></button>`).join("")}</div>
  </section>`;
}

function desenhar() {
  guardarEndereco();
  $("#limpar").hidden = !campo.value;
  if (tela === "kit") { conteudo.innerHTML = telaKit(); return; }
  const q = campo.value.trim();
  if (!q && !filtros.categoria && !filtros.uf && !filtros.situacao) { conteudo.innerHTML = inicio(); $("#anuncio").textContent = ""; return; }
  const lista = resultados();
  const cat = DADOS.categorias.find((c) => c.id === filtros.categoria);
  const chips = [
    cat && `<button class="filtro" data-tirar="categoria">${cat.icone} ${esc(cat.nome)} ✕</button>`,
    filtros.uf && `<button class="filtro" data-tirar="uf">📍 ${UFS[filtros.uf][0]} ✕</button>`,
    filtros.situacao && `<button class="filtro" data-tirar="situacao">${{ ok: "Válidas", vence: "Vencem em até 15 dias", vencida: "Vencidas" }[filtros.situacao]} ✕</button>`,
  ].filter(Boolean).join("");
  const titulo = q ? `${lista.length} resultado${lista.length !== 1 ? "s" : ""} para “${esc(q)}”` : `${lista.length} documento${lista.length !== 1 ? "s" : ""}`;
  const zip = cat ? `<a class="btn" href="${cat.abrirPasta.replace("?path=", "/download?path=")}">⬇ Baixar a pasta (zip)</a>` : "";
  conteudo.innerHTML = `<section>
    <div class="resultado-topo"><h2>${titulo}</h2>${chips}${zip}<button class="btn" id="voltar">Início</button></div>
  </section>
  ${q && kitNaFrase(q) ? (() => { const l = kitNaFrase(q); return `<section class="kit-sugerido"><div><b>🧰 Kit da licitação em ${esc(l.cidade)}/${l.uf}</b><span class="meta">SICAF, certidões, CNPJ, estatuto e balanço — tudo junto, com a validade de cada um.</span></div><button class="btn amarelo" data-montar="${esc(l.cidade)}|${l.uf}">Montar kit</button></section>`; })() : ""}
  ${q ? cartaoIA(q) : ""}
  <section class="lista">${lista.length ? lista.map(cartao).join("") : semResultado(q)}</section>`;
  $("#anuncio").textContent = titulo.replace(/[“”]/g, "");
}

function semResultado(q) {
  const ideias = ["certidão federal", "FGTS", "SICAF Recife", "certidão municipal São Paulo", "estatuto social", "balanço"];
  return `<div class="vazio"><p><b>Nada encontrado${q ? ` para “${esc(q)}”` : ""}.</b></p><p>Tente outras palavras ou um destes:</p>
    <div class="sugestoes">${ideias.map((i) => `<button data-q="${i}">${i}</button>`).join("")}</div></div>`;
}

// ---------- kit (vários documentos de uma vez) ----------
function atualizarKit() {
  sessionStorage.setItem("kit", JSON.stringify([...kit]));
  $("#kit").hidden = kit.size === 0 || tela === "kit";
  $("#kitTexto").textContent = `${kit.size} documento${kit.size > 1 ? "s" : ""} no kit`;
}
function avisar(msg) {
  const a = $("#aviso"); a.textContent = msg; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.hidden = true), 3200);
}
async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); avisar(msg); } catch { prompt("Copie o texto:", texto); }
}
async function baixarKit() {
  const docs = [...kit].map((id) => PORID[id]).filter((d) => d && d.tipo !== "url");
  avisar(`Baixando ${docs.length} arquivo${docs.length > 1 ? "s" : ""}… se o navegador perguntar, permita vários downloads.`);
  for (const d of docs) {
    const a = document.createElement("a"); a.href = d.download; a.download = d.arquivo; document.body.appendChild(a); a.click(); a.remove();
    await new Promise((r) => setTimeout(r, 900));
  }
}

// ---------- eventos ----------
$("#formBusca").addEventListener("submit", (e) => { e.preventDefault(); campo.blur(); confirmarBusca(); });
let espera, esperaRegistro;
campo.addEventListener("input", () => {
  tela = "busca";
  clearTimeout(espera); espera = setTimeout(desenhar, 160);
  clearTimeout(esperaRegistro); esperaRegistro = setTimeout(() => registrarBusca(false), 2500);  // registra quando a pessoa para de digitar
});
$("#limpar").onclick = () => { campo.value = ""; tela = "busca"; desenhar(); campo.focus(); };
document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== campo) { e.preventDefault(); campo.focus(); } });

conteudo.addEventListener("click", (e) => {
  const abrir = e.target.closest("[data-abrir]");
  if (abrir) { const d = PORID[abrir.dataset.abrir]; registrar({ tipo: "abriu", q: campo.value.trim(), doc: d?.titulo }); return; }
  const alvo = e.target.closest("[data-montar],[data-cat],[data-uf],[data-sit],[data-tirar],[data-kit],[data-kit-todos],[data-copiar],[data-q],[data-ia],#voltar,#montarKit,#kitBaixar,#kitCopiar");
  if (!alvo) return;
  if (alvo.id === "voltar") { campo.value = ""; filtros = { categoria: "", uf: "", situacao: "" }; tela = "busca"; atualizarKit(); desenhar(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (alvo.id === "montarKit") { const v = $("#localKit").value; if (!v) { avisar("Escolha a cidade da contratação."); $("#localKit").focus(); return; } const [c, uf] = v.split("|"); montarKit(c, uf); return; }
  if (alvo.id === "kitBaixar") return baixarKit();
  if (alvo.id === "kitCopiar") return copiar(textoKit([...kit].map((id) => PORID[id]).filter(Boolean)), "Links do kit copiados");
  if (alvo.dataset.ia) return perguntarIA(campo.value.trim());
  if (alvo.dataset.montar) { const [c, uf] = alvo.dataset.montar.split("|"); return montarKit(c, uf); }
  if (alvo.dataset.cat) { filtros.categoria = alvo.dataset.cat; confirmarBusca(); }
  else if (alvo.dataset.uf) { filtros.uf = alvo.dataset.uf; confirmarBusca(); }
  else if (alvo.dataset.sit) { filtros.situacao = alvo.dataset.sit; confirmarBusca(); }
  else if (alvo.dataset.tirar) { filtros[alvo.dataset.tirar] = ""; desenhar(); }
  else if (alvo.dataset.q) { campo.value = alvo.dataset.q; confirmarBusca(); }
  else if (alvo.dataset.copiar) { const d = PORID[alvo.dataset.copiar]; copiar(d.urlExterna || d.download, "Link copiado"); }
  else if (alvo.dataset.kitTodos) { alvo.dataset.kitTodos.split(",").forEach((id) => kit.add(id)); atualizarKit(); desenhar(); avisar("Documentos colocados no kit"); }
  else if (alvo.dataset.kit) {
    const id = alvo.dataset.kit;
    kit.has(id) ? kit.delete(id) : kit.add(id);
    atualizarKit();
    if (tela === "kit") { desenhar(); return; }
    const card = alvo.closest(".doc"); card.classList.toggle("no-kit", kit.has(id));
    alvo.textContent = kit.has(id) ? "✓" : "+"; alvo.setAttribute("aria-pressed", kit.has(id));
  }
});
$("#kitVer").onclick = () => { tela = "kit"; atualizarKit(); desenhar(); conteudo.scrollIntoView({ behavior: "smooth" }); };
$("#kitLimpar").onclick = () => { kit.clear(); atualizarKit(); if (tela === "kit") tela = "busca"; desenhar(); };

// ---------- voz: reconhecimento gratuito do próprio navegador ----------
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, falou = "";
function abrirVoz() {
  if (!Reconhecimento) { avisar("Busca por voz indisponível neste navegador. Use o Chrome (Android/PC) ou o Safari (iPhone)."); return; }
  if (rec) return;
  falou = "";
  $("#voz").hidden = false; $("#vozTitulo").textContent = "Pode falar…"; $("#vozTexto").textContent = "Ex.: “certidão do FGTS”";
  rec = new Reconhecimento();
  rec.lang = "pt-BR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    falou = Array.from(e.results).map((r) => r[0].transcript).join(" ").replace(/[.!?]$/, "");
    $("#vozTexto").textContent = falou; $("#vozTitulo").textContent = "Entendi:";
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") avisar("Permita o uso do microfone para buscar falando.");
    else if (e.error === "no-speech") avisar("Não ouvi nada. Toque no microfone e fale de novo.");
    else if (e.error !== "aborted") avisar("Não consegui ouvir agora. Tente de novo ou digite.");
  };
  rec.onend = () => {
    rec = null; $("#voz").hidden = true;
    if (falou) { campo.value = falou; confirmarBusca(true); }
  };
  try { rec.start(); } catch { rec = null; $("#voz").hidden = true; }
}
$("#mic").onclick = abrirVoz;
$("#vozMic").onclick = () => rec?.stop();
$("#vozFechar").onclick = () => { falou = ""; rec?.abort(); $("#voz").hidden = true; };

// ---------- app instalável só no celular (no computador fica site comum) ----------
if (CELULAR) {
  const m = document.createElement("link"); m.rel = "manifest"; m.href = "manifest.webmanifest"; document.head.appendChild(m);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  let pedido = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; $("#instalar").hidden = false; });
  addEventListener("appinstalled", () => { $("#instalar").hidden = true; });
  $("#instalar").onclick = async () => { if (!pedido) return; pedido.prompt(); await pedido.userChoice.catch(() => {}); pedido = null; $("#instalar").hidden = true; };
  // iPhone não tem botão de instalar: dica uma vez
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  let viu = false; try { viu = localStorage.getItem("dicaIos") === "1"; } catch {}
  if (ios && !viu) setTimeout(() => { $("#dicaIos").hidden = false; }, 6000);
  $("#dicaIosFechar").onclick = () => { $("#dicaIos").hidden = true; try { localStorage.setItem("dicaIos", "1"); } catch {} };
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
}

iniciar();
