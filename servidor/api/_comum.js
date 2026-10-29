// Partes comuns do servidor do Habilita (Vercel). O site é estático no GitHub Pages;
// aqui ficam só o que não pode ir para o navegador: a chave da IA (válida só no dia do teste) e o registro das buscas.
import { put, list, get } from "@vercel/blob";

export const SITE = process.env.SITE_URL || "https://malneto.github.io/habilita-serpro/";
// IA liberada só até a meia-noite de 29/10/2026 (Brasília). Depois disso o servidor recusa, mesmo com chave.
export const IA_ATE = new Date(process.env.IA_ATE || "2026-10-30T03:00:00Z");
export const IA_LIMITE = Number(process.env.IA_LIMITE || 400);

export function cors(req, res) {
  const origem = req.headers.origin || "";
  const ok = origem === "https://malneto.github.io" || origem.startsWith("http://localhost");
  res.setHeader("Access-Control-Allow-Origin", ok ? origem : "https://malneto.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

export const iaLiberada = () => Boolean(process.env.ANTHROPIC_API_KEY) && Date.now() < IA_ATE.getTime();

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// contador de perguntas do dia (teto de gasto)
export async function usoDoDia() {
  try {
    const r = await get(`uso/${hojeBR()}.json`, { access: "private", useCache: false });
    if (r?.statusCode === 200) return JSON.parse(await new Response(r.stream).text()).perguntas || 0;
  } catch {}
  return 0;
}
export async function somarUso() {
  const n = (await usoDoDia()) + 1;
  await put(`uso/${hojeBR()}.json`, JSON.stringify({ perguntas: n }), { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json" });
  return n;
}

// registro anônimo (sem IP, sem identificação): o que as pessoas procuram e o que não acham
export async function registrar(evento) {
  const quando = new Date().toISOString();
  await put(`buscas/${hojeBR()}/${quando}-${Math.random().toString(36).slice(2, 7)}.json`, JSON.stringify({ quando, ...evento }),
    { access: "private", addRandomSuffix: false, contentType: "application/json" });
}

let catalogo = { quando: 0, dados: null };
export async function dadosDoSite() {
  if (catalogo.dados && Date.now() - catalogo.quando < 10 * 60e3) return catalogo.dados;
  const r = await fetch(SITE + "dados.json", { cache: "no-store" });
  catalogo = { quando: Date.now(), dados: await r.json() };
  return catalogo.dados;
}

export async function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let t = ""; for await (const p of req) t += p;
  try { return JSON.parse(t || "{}"); } catch { return {}; }
}
export { list };
