import { cors, corpo, registrar } from "./_comum.js";

// Registro anônimo de busca: texto buscado, quantos resultados, se veio por voz e o que foi aberto.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  const b = await corpo(req);
  const evento = {
    tipo: ["busca", "abriu", "kit", "pergunta"].includes(b.tipo) ? b.tipo : "busca",
    q: String(b.q || "").slice(0, 200),
    resultados: Number.isFinite(b.resultados) ? b.resultados : null,
    voz: Boolean(b.voz),
    doc: String(b.doc || "").slice(0, 200),
    celular: Boolean(b.celular),
  };
  try { await registrar(evento); } catch {}
  res.status(204).end();
}
