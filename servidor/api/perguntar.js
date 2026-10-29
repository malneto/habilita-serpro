import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { cors, corpo, iaLiberada, IA_LIMITE, usoDoDia, somarUso, dadosDoSite, registrar } from "./_comum.js";

// "Pergunte ao Habilita": a pessoa pergunta do jeito dela e a IA responde em poucas linhas,
// apontando os documentos da pasta. Só funciona no dia do teste (ver IA_ATE) e até o teto IA_LIMITE.
const Resposta = z.object({
  resposta: z.string().describe("Resposta direta em 1 a 3 frases simples, para qualquer pessoa entender"),
  documentos: z.array(z.object({
    id: z.string().describe("id exato do documento no catálogo"),
    motivo: z.string().describe("Por que este documento atende, em poucas palavras"),
  })).describe("Documentos que atendem, do mais importante ao menos; vazio se nenhum"),
});

const UF = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };

function situacao(d, hoje) {
  if (!d.validade) return "";
  const dias = Math.round((new Date(d.validade.ate + "T00:00:00Z") - hoje) / 864e5);
  const data = d.validade.ate.split("-").reverse().join("/");
  return dias < 0 ? `VENCIDA em ${data}` : dias <= 15 ? `vence em ${dias} dias (${data})` : `válida até ${data}`;
}

let cliente;
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  if (!iaLiberada()) return res.status(410).json({ ok: false, error: "A pergunta com IA foi só para o dia de teste. Use a busca." });
  if ((await usoDoDia()) >= IA_LIMITE) return res.status(429).json({ ok: false, error: "Limite de perguntas de hoje atingido. Use a busca." });

  const b = await corpo(req);
  const pergunta = String(b.pergunta || "").trim().slice(0, 500);
  if (pergunta.length < 3) return res.status(400).json({ ok: false, error: "Pergunta vazia." });

  const dados = await dadosDoSite();
  const hoje = new Date(new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10) + "T00:00:00Z");
  const cats = Object.fromEntries(dados.categorias.map((c) => [c.id, c.nome]));
  const linhas = dados.documentos.map((d) => [d.id, d.titulo, cats[d.categoria] || d.categoria, d.cidade || (d.uf ? UF[d.uf] : ""), d.uf || "", situacao(d, hoje)].join(" | "));
  // trechos dos documentos que a busca do navegador já achou (para perguntas sobre o conteúdo)
  const porId = Object.fromEntries(dados.documentos.map((d) => [d.id, d]));
  const trechos = (Array.isArray(b.candidatos) ? b.candidatos : []).slice(0, 5).map((id) => porId[id]).filter(Boolean)
    .map((d) => `### ${d.id} — ${d.titulo}\n${(d.texto || "").slice(0, 1800)}`).join("\n\n");

  const sistema = `Você é o assistente do Habilita, o site onde clientes do Serpro (órgãos públicos e empresas) encontram a documentação de habilitação do Serpro: SICAF, certidões federal, estaduais, municipais, FGTS, trabalhista, falência, CADIN, estatuto, leis de criação, balanços, TCU, Junta Comercial, CNPJ e declarações.
Responda em português do Brasil, curto e simples, como um atendente gentil. Use só o catálogo e os trechos abaixo: nunca invente documento, data, número ou valor. Se não houver documento para o pedido, diga isso e sugira o que existe.
Para "kit de licitação"/"documentos para contratar" num local, inclua: SICAF da regional, certidão federal, FGTS, trabalhista, falência, certidão estadual da UF e municipal da cidade (se existirem), CNPJ do local, estatuto e balanço.
Avise quando um documento indicado estiver vencido ou vencendo.

Catálogo (id | título | tipo | local | UF | validade):
${linhas.join("\n")}`;

  try {
    cliente ||= new Anthropic();
    const r = await cliente.messages.parse({
      model: process.env.MODELO || "claude-opus-5-5",
      max_tokens: 2000,
      system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: zodOutputFormat(Resposta) },
      messages: [{ role: "user", content: `${trechos ? `Trechos de documentos encontrados pela busca:\n${trechos}\n\n` : ""}Pergunta: ${pergunta}` }],
    });
    await somarUso();
    if (r.stop_reason === "refusal" || !r.parsed_output) return res.status(200).json({ ok: false, error: "Não consegui responder essa. Tente a busca." });
    const saida = r.parsed_output;
    saida.documentos = saida.documentos.filter((d) => porId[d.id]).slice(0, 12);
    registrar({ tipo: "pergunta", q: pergunta, resultados: saida.documentos.length }).catch(() => {});
    res.status(200).json({ ok: true, ...saida });
  } catch (e) {
    res.status(500).json({ ok: false, error: "A IA não respondeu agora. Use a busca." });
  }
}
