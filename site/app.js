/* Habilita — busca na documentação de habilitação do Serpro.
   Tudo roda no navegador: índice estático (dados.json, gerado pelo robô), MiniSearch para a busca
   e o reconhecimento de voz do próprio navegador. Nenhuma API paga. */
"use strict";

const $ = (s) => document.querySelector(s);
const conteudo = $("#conteudo");
const campo = $("#q");
let DADOS = null, BUSCA = null, PORID = {};
let filtros = { categoria: "", uf: "", situacao: "" };
const kit = new Set(JSON.parse(sessionStorage.getItem("kit") || "[]"));

// ---------- texto ----------
// tira acento mantendo o mesmo tamanho (permite achar o trecho no texto original)
const base = (s) => Array.from(String(s || "")).map((c) => c.normalize("NFD")[0]).join("").toLowerCase();
const PARADAS = new Set("a o os as de da do das dos e em no na nos nas para pra pro por com que qual quais onde esta este essa esse eu me minha meu um uma uns umas preciso quero queria gostaria favor ver achar encontrar mostrar mostra documento documentos arquivo arquivos sobre tem tenho do serpro".split(" "));

// vocabulário de quem pede documento de habilitação → termos que aparecem nos arquivos
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
  negativa: "certidao", cnd: "certidao negativa", regularidade: "certidao regular", vencimento: "validade tabela", validade: "vencimento",
  cadin: "cadin", cadastral: "cadastrais dados", dados: "cadastrais",
};

const UFS = {
  AC: ["Acre", "Rio Branco"], AL: ["Alagoas", "Maceió"], AP: ["Amapá", "Macapá"], AM: ["Amazonas", "Manaus"], BA: ["Bahia", "Salvador"],
  CE: ["Ceará", "Fortaleza"], DF: ["Distrito Federal", "Brasília"], ES: ["Espírito Santo", "Vitória"], GO: ["Goiás", "Goiânia"],
  MA: ["Maranhão", "São Luís"], MT: ["Mato Grosso", "Cuiabá"], MS: ["Mato Grosso do Sul", "Campo Grande"], MG: ["Minas Gerais", "Belo Horizonte"],
  PA: ["Pará", "Belém"], PB: ["Paraíba", "João Pessoa"], PR: ["Paraná", "Curitiba"], PE: ["Pernambuco", "Recife"], PI: ["Piauí", "Teresina"],
  RJ: ["Rio de Janeiro", "Rio de Janeiro"], RN: ["Rio Grande do Norte", "Natal"], RS: ["Rio Grande do Sul", "Porto Alegre"], RO: ["Rondônia", "Porto Velho"],
  RR: ["Roraima", "Boa Vista"], SC: ["Santa Catarina", "Florianópolis"], SP: ["São Paulo", "São Paulo"], SE: ["Sergipe", "Aracaju"], TO: ["Tocantins", "Palmas"],
};
// siglas que também são palavras comuns ("se", "to", "pa"…) só valem escritas em maiúsculas
const SIGLA_SEGURA = new Set("pe pb pr pi rj rn rs ro rr sc sp df mg ms mt ce ba go".split(" "));

function ufNaFrase(original) {
  const t = " " + base(original).replace(/[^a-z0-9]+/g, " ") + " ";
  const nomes = [];
  for (const [uf, [estado, capital]] of Object.entries(UFS)) nomes.push([base(estado), uf], [base(capital), uf]);
  nomes.sort((a, b) => b[0].length - a[0].length);  // "mato grosso do sul" antes de "mato grosso"
  for (const [nome, uf] of nomes) if (t.includes(" " + nome + " ")) return uf;
  for (const palavra of String(original).split(/[^A-Za-zÀ-ú]+/)) {
    const p = palavra.toUpperCase();
    if (UFS[p] && (palavra === p || SIGLA_SEGURA.has(palavra.toLowerCase()))) return p;
  }
  return "";
}

// sigla com letras trocadas ("fgst", "tuc", "cnjp") vira a sigla certa: mesmas letras, outra ordem
const ordenar = (t) => t.split("").sort().join("");
const SIGLAS_CONHECIDAS = Object.keys(SINONIMOS).filter((k) => k.length <= 6);
function corrigir(t) {
  if (SINONIMOS[t] || t.length < 3 || t.length > 6) return t;
  return SIGLAS_CONHECIDAS.find((k) => k.length === t.length && ordenar(k) === ordenar(t)) || t;
}
function termos(q) {
  return base(q).split(/[^a-z0-9]+/).filter((t) => t && !PARADAS.has(t)).map(corrigir);
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
    d.local = [d.cidade, d.uf && UFS[d.uf] ? `${UFS[d.uf][0]} ${d.uf}` : ""].filter(Boolean).join(" ");
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
  $("#metaTopo").innerHTML = `${DADOS.documentos.length} documentos · atualizado em ${quando.toLocaleDateString("pt-BR")} às ${quando.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · <a href="${DADOS.fonte.url}" target="_blank" rel="noopener">pasta original</a>`;
  const atalhos = [["Certidão federal", "certidão federal"], ["FGTS", "FGTS"], ["Trabalhista", "certidão trabalhista"], ["SICAF", "SICAF"], ["Estatuto", "estatuto social"], ["Balanço e DRE", "balanço DRE"], ["CNPJ", "CNPJ"], ["Falência", "falência"], ["TCU", "TCU"]];
  $("#atalhos").innerHTML = atalhos.map(([r, q]) => `<button class="atalho" data-q="${q}">${r}</button>`).join("");
  $("#atalhos").onclick = (e) => { const b = e.target.closest("[data-q]"); if (b) { campo.value = b.dataset.q; buscar(); } };

  const p = new URLSearchParams(location.search);
  campo.value = p.get("q") || "";
  filtros = { categoria: p.get("cat") || "", uf: p.get("uf") || "", situacao: p.get("sit") || "" };
  atualizarKit();
  desenhar();
}

// ---------- busca ----------
function resultados() {
  const q = campo.value.trim();
  let lista;
  if (q) {
    const ts = termos(q);
    const extra = ts.flatMap((t) => (SINONIMOS[t] || "").split(" ")).filter(Boolean);
    const uf = filtros.uf ? "" : ufNaFrase(q);
    const consulta = [...ts, ...extra].join(" ") || q;
    lista = BUSCA.search(consulta, {
      combineWith: "OR",
      boostDocument: (id) => {
        const d = PORID[id];
        let b = 1;
        if (uf) b *= d.uf === uf ? 4 : 0.35;                          // "Pernambuco"/"Recife"/"PE" puxa os documentos daquele estado
        if (ts.some((t) => base(d.titulo).includes(t))) b *= 1.3;
        return b;
      },
    }).map((r) => ({ ...PORID[r.id], score: r.score, achados: r.terms }));
    // corta a cauda irrelevante (muito abaixo do melhor resultado)
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

function buscar() {
  desenhar();
  window.scrollTo({ top: Math.max(0, $(".topo").offsetHeight - 70), behavior: "smooth" });
}

function guardarEndereco() {
  const p = new URLSearchParams();
  if (campo.value.trim()) p.set("q", campo.value.trim());
  if (filtros.categoria) p.set("cat", filtros.categoria);
  if (filtros.uf) p.set("uf", filtros.uf);
  if (filtros.situacao) p.set("sit", filtros.situacao);
  history.replaceState(null, "", p.toString() ? `?${p}` : location.pathname);
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
  let pedaco = esc(texto.slice(ini, fim));
  const pb = base(texto.slice(ini, fim));
  // marca os termos achados (posições calculadas no texto sem acento, que tem o mesmo tamanho)
  const marcas = [];
  for (const t of new Set(achados)) { let i = pb.indexOf(t); while (i >= 0) { marcas.push([i, i + t.length]); i = pb.indexOf(t, i + t.length); } }
  if (marcas.length) {
    const orig = texto.slice(ini, fim); let out = "", cur = 0;
    marcas.sort((a, b) => a[0] - b[0]).forEach(([a, z]) => { if (a < cur) return; out += esc(orig.slice(cur, a)) + "<mark>" + esc(orig.slice(a, z)) + "</mark>"; cur = z; });
    pedaco = out + esc(orig.slice(cur));
  }
  return `${ini > 0 ? "…" : ""}${pedaco}${fim < texto.length ? "…" : ""}`;
}

function cartao(d) {
  const sit = d.sit;
  const ver = d.ver || d.urlExterna || d.download;
  const icone = d.tipo === "url" ? "🔗" : d.tipo === "xlsx" ? "📊" : d.cat.icone;
  const mini = d.miniatura ? `<img src="${d.miniatura}" alt="" loading="lazy">` : `<span>${icone}</span>`;
  return `<article class="doc ${kit.has(d.id) ? "no-kit" : ""}" data-id="${d.id}">
    <a class="mini" href="${ver}" target="_blank" rel="noopener" aria-label="Ver ${esc(d.titulo)}">${mini}</a>
    <div>
      <h3>${esc(d.titulo)}</h3>
      <p class="trilha">${d.pastas.map(esc).join(" › ")}</p>
      <div class="selos">
        <span class="selo">${d.cat.icone} ${esc(d.cat.nome)}</span>
        ${d.local ? `<span class="selo">📍 ${esc(d.local)}</span>` : ""}
        ${sit ? `<span class="selo ${sit.tipo}" title="${esc(sit.fonte)}">${sit.tipo === "ok" ? "✓" : sit.tipo === "vence" ? "⏳" : "⚠"} ${esc(sit.texto)}</span>` : ""}
      </div>
      ${d.achados ? `<p class="trecho">${trecho(d, d.achados)}</p>` : ""}
      <div class="acoes">
        ${d.tipo === "url" ? `<a class="btn primario" href="${esc(d.urlExterna)}" target="_blank" rel="noopener">Abrir link</a>`
          : `<a class="btn primario" href="${ver}" target="_blank" rel="noopener">Ver</a><a class="btn" href="${d.download}">Baixar</a>`}
        <button class="btn" data-copiar="${d.id}">Copiar link</button>
        <a class="btn" href="${d.abrirPasta}" target="_blank" rel="noopener">Pasta</a>
      </div>
    </div>
    <button class="marcar" data-kit="${d.id}" title="${kit.has(d.id) ? "Tirar do kit" : "Adicionar ao kit"}" aria-label="Adicionar ao kit">${kit.has(d.id) ? "✓" : "+"}</button>
  </article>`;
}

function inicio() {
  const docs = DADOS.documentos;
  const com = docs.filter((d) => d.sit);
  const n = (t) => com.filter((d) => d.sit.tipo === t).length;
  const recentes = docs.slice().sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm)).slice(0, 8);
  const ufs = Object.keys(UFS).filter((uf) => docs.some((d) => d.uf === uf));
  return `
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
    <div class="recentes">${recentes.map((d) => `<a class="recente" href="${d.ver || d.urlExterna || d.download}" target="_blank" rel="noopener">
      ${d.miniatura ? `<img src="${d.miniatura}" alt="" loading="lazy">` : `<span class="sem-mini"></span>`}
      <div><b>${esc(d.titulo)}</b><span class="meta">${new Date(d.modificadoEm).toLocaleDateString("pt-BR")}</span></div></a>`).join("")}</div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Navegue por tipo</h2></div>
    <div class="categorias">${DADOS.categorias.map((c) => `<button class="categoria" data-cat="${esc(c.id)}">
      <span class="emoji">${c.icone}</span><span><b>${esc(c.nome)}</b><small>${c.total} documento${c.total > 1 ? "s" : ""}${c.descricao ? " · " + esc(c.descricao) : ""}</small></span></button>`).join("")}</div>
  </section>
  <section>
    <div class="secao-titulo"><h2>Por estado</h2><span class="meta">SICAF, certidões estaduais e municipais, CNPJ</span></div>
    <div class="estados">${ufs.map((uf) => `<button class="uf" data-uf="${uf}">${uf}<small>${docs.filter((d) => d.uf === uf).length}</small></button>`).join("")}</div>
  </section>`;
}

function desenhar() {
  guardarEndereco();
  $("#limpar").hidden = !campo.value;
  const q = campo.value.trim();
  if (!q && !filtros.categoria && !filtros.uf && !filtros.situacao) { conteudo.innerHTML = inicio(); return; }
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
  <section class="lista">${lista.length ? lista.map(cartao).join("") : semResultado(q)}</section>`;
}

function semResultado(q) {
  const ideias = ["certidão federal", "FGTS", "SICAF Recife", "certidão municipal São Paulo", "estatuto social", "balanço"];
  return `<div class="vazio"><p><b>Nada encontrado${q ? ` para “${esc(q)}”` : ""}.</b></p><p>Tente outras palavras ou um destes:</p>
    <div class="sugestoes">${ideias.map((i) => `<button data-q="${i}">${i}</button>`).join("")}</div></div>`;
}

// ---------- kit (vários documentos de uma vez) ----------
function atualizarKit() {
  sessionStorage.setItem("kit", JSON.stringify([...kit]));
  $("#kit").hidden = kit.size === 0;
  $("#kitTexto").textContent = `${kit.size} documento${kit.size > 1 ? "s" : ""} no kit`;
}
function avisar(msg) {
  const a = $("#aviso"); a.textContent = msg; a.hidden = false;
  clearTimeout(avisar.t); avisar.t = setTimeout(() => (a.hidden = true), 2600);
}
async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); avisar(msg); } catch { prompt("Copie o texto:", texto); }
}

// ---------- eventos ----------
$("#formBusca").addEventListener("submit", (e) => { e.preventDefault(); campo.blur(); buscar(); });
let espera;
campo.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(desenhar, 160); });
$("#limpar").onclick = () => { campo.value = ""; desenhar(); campo.focus(); };
document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement !== campo) { e.preventDefault(); campo.focus(); } });

conteudo.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-cat],[data-uf],[data-sit],[data-tirar],[data-kit],[data-copiar],[data-q],#voltar");
  if (!alvo) return;
  if (alvo.id === "voltar") { campo.value = ""; filtros = { categoria: "", uf: "", situacao: "" }; desenhar(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (alvo.dataset.cat) { filtros.categoria = alvo.dataset.cat; buscar(); }
  else if (alvo.dataset.uf) { filtros.uf = alvo.dataset.uf; buscar(); }
  else if (alvo.dataset.sit) { filtros.situacao = alvo.dataset.sit; buscar(); }
  else if (alvo.dataset.tirar) { filtros[alvo.dataset.tirar] = ""; desenhar(); }
  else if (alvo.dataset.q) { campo.value = alvo.dataset.q; buscar(); }
  else if (alvo.dataset.copiar) { const d = PORID[alvo.dataset.copiar]; copiar(d.urlExterna || d.download, "Link copiado"); }
  else if (alvo.dataset.kit) {
    const id = alvo.dataset.kit;
    kit.has(id) ? kit.delete(id) : kit.add(id);
    atualizarKit();
    const card = alvo.closest(".doc"); card.classList.toggle("no-kit", kit.has(id)); alvo.textContent = kit.has(id) ? "✓" : "+";
  }
});

$("#kitLimpar").onclick = () => { kit.clear(); atualizarKit(); desenhar(); };
$("#kitCopiar").onclick = () => {
  const linhas = [...kit].map((id) => PORID[id]).filter(Boolean).map((d) => `• ${d.titulo}${d.sit ? ` (${d.sit.texto.toLowerCase()})` : ""}\n  ${d.urlExterna || d.download}`);
  copiar(`Documentos do Serpro:\n${linhas.join("\n")}`, "Links do kit copiados");
};
$("#kitBaixar").onclick = async () => {
  const docs = [...kit].map((id) => PORID[id]).filter((d) => d && d.tipo !== "url");
  avisar(`Baixando ${docs.length} arquivo${docs.length > 1 ? "s" : ""}… (permita downloads múltiplos se o navegador perguntar)`);
  for (const d of docs) {
    const a = document.createElement("a"); a.href = d.download; a.download = d.arquivo; document.body.appendChild(a); a.click(); a.remove();
    await new Promise((r) => setTimeout(r, 900));
  }
};

// ---------- voz (reconhecimento do próprio navegador, sem custo) ----------
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $("#mic");
if (!Reconhecimento) {
  mic.onclick = () => avisar("Busca por voz indisponível neste navegador — use o Chrome ou o Safari atualizados.");
} else {
  let rec = null;
  mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new Reconhecimento();
    rec.lang = "pt-BR"; rec.interimResults = true; rec.maxAlternatives = 1;
    mic.classList.add("ativo"); $("#ouvindo").hidden = false;
    rec.onresult = (e) => {
      const fala = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      campo.value = fala.replace(/[.!?]$/, "");
      desenhar();
    };
    rec.onerror = (e) => { if (e.error === "not-allowed") avisar("Permita o uso do microfone para buscar por voz."); else if (e.error !== "no-speech" && e.error !== "aborted") avisar("Não consegui ouvir. Tente de novo."); };
    rec.onend = () => { mic.classList.remove("ativo"); $("#ouvindo").hidden = true; rec = null; if (campo.value) buscar(); };
    rec.start();
  };
}

iniciar();
