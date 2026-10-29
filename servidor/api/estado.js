import { cors, iaLiberada, IA_ATE, IA_LIMITE, usoDoDia } from "./_comum.js";

// O site pergunta aqui se a IA está liberada (só no dia do teste e dentro do teto).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const liberada = iaLiberada();
  const usadas = liberada ? await usoDoDia() : 0;
  res.status(200).json({ ia: liberada && usadas < IA_LIMITE, ate: IA_ATE.toISOString(), restantes: liberada ? Math.max(0, IA_LIMITE - usadas) : 0 });
}
