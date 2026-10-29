#!/usr/bin/env python3
"""Alerta diário de documentação vencida/vencendo do Habilita, por e-mail (grátis: SMTP do Gmail).

Roda pelo cron às 8h. Só envia quando há novidade: cada documento avisa uma vez em cada etapa
(15 dias, 7 dias, 1 dia, vencida). Configuração em ~/.config/habilita/email.env:
  SMTP_USER=malneto@gmail.com
  SMTP_PASS=<senha de app do Google, 16 letras>
  PARA=pessoa1@serpro.gov.br,pessoa2@serpro.gov.br
  ATIVO=sim            # sem "sim", só gera a prévia (.cache/alerta_previa.html) e não envia nada
Uso: python3 sync/alerta.py [--previa]   (--previa: gera a prévia ignorando o que já foi avisado)
"""
import datetime as dt, html, json, os, smtplib, sys
from email.message import EmailMessage
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "docs" / "dados.json"
ESTADO = RAIZ / ".cache" / "alertas_enviados.json"
PREVIA = RAIZ / ".cache" / "alerta_previa.html"
CONFIG = Path.home() / ".config" / "habilita" / "email.env"
SITE = "https://habilita-serpro.pages.dev/"
HOJE = dt.date.today()


def config():
    c = {}
    if CONFIG.exists():
        for linha in CONFIG.read_text().splitlines():
            if "=" in linha and not linha.strip().startswith("#"):
                k, v = linha.split("=", 1)
                c[k.strip()] = v.strip()
    return c


def br(iso):
    return dt.date.fromisoformat(iso).strftime("%d/%m/%Y")


def etapa(dias):
    return "vencida" if dias < 0 else "1" if dias <= 1 else "7" if dias <= 7 else "15" if dias <= 15 else None


def itens():
    d = json.loads(DADOS.read_text("utf-8"))
    lista = []
    for x in d.get("foraPorVencimento", []):
        dias = (dt.date.fromisoformat(x["venceu"]) - HOJE).days
        lista.append({"titulo": x["titulo"], "ate": x["venceu"], "dias": dias, "etapa": "vencida", "pasta": x.get("abrirPasta"), "planilha": x.get("planilhaDiz")})
    for x in d["documentos"]:
        v = x.get("validade")
        if not v:
            continue
        dias = (dt.date.fromisoformat(v["ate"]) - HOJE).days
        e = etapa(dias)
        if e:
            lista.append({"titulo": x["titulo"], "ate": v["ate"], "dias": dias, "etapa": e, "pasta": x.get("abrirPasta"), "planilha": None})
    return sorted(lista, key=lambda i: i["dias"])


def montar(lista, novos):
    vencidas = [i for i in lista if i["etapa"] == "vencida"]
    vencendo = [i for i in lista if i["etapa"] != "vencida"]
    chave_nova = {(i["titulo"], i["ate"], i["etapa"]) for i in novos}

    def linha(i):
        novo = (i["titulo"], i["ate"], i["etapa"]) in chave_nova
        quando = f"venceu em {br(i['ate'])}" if i["dias"] < 0 else ("vence hoje" if i["dias"] == 0 else f"vence em {i['dias']} dia{'s' if i['dias'] > 1 else ''} ({br(i['ate'])})")
        extra = f"<br><span style='color:#b65d00'>A planilha de vencimentos diz renovada até {br(i['planilha'])} — falta colocar o PDF novo na pasta.</span>" if i.get("planilha") else ""
        selo = "<span style='background:#ffcd07;color:#000066;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:700'>NOVO</span> " if novo else ""
        return (f"<tr><td style='padding:8px 10px;border-bottom:1px solid #e3e8f1'>{selo}<b>{html.escape(i['titulo'])}</b><br>"
                f"<span style='color:#5a6a83'>{quando}</span>{extra}</td>"
                f"<td style='padding:8px 10px;border-bottom:1px solid #e3e8f1;text-align:right'>"
                f"{'<a href=' + chr(34) + i['pasta'] + chr(34) + ' style=' + chr(34) + 'color:#155bcb' + chr(34) + '>pasta</a>' if i.get('pasta') else ''}</td></tr>")

    def bloco(titulo, cor, xs):
        if not xs:
            return ""
        return (f"<h2 style='font-size:15px;color:{cor};margin:22px 0 6px'>{titulo} ({len(xs)})</h2>"
                f"<table style='width:100%;border-collapse:collapse;font-size:14px'>{''.join(linha(i) for i in xs)}</table>")

    assunto = []
    if vencidas: assunto.append(f"{len(vencidas)} vencida{'s' if len(vencidas) > 1 else ''}")
    if vencendo: assunto.append(f"{len(vencendo)} vencendo em até 15 dias")
    assunto = "Habilita: certidões do Serpro — " + " e ".join(assunto)
    corpo = f"""<div style="font-family:Rawline,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:auto;color:#0f1b33">
  <div style="background:linear-gradient(135deg,#000066,#003da5);color:#fff;padding:18px 20px;border-radius:14px 14px 0 0">
    <div style="font-size:20px;font-weight:800">Habilita</div>
    <div style="opacity:.85;font-size:13px">Alerta de validade da documentação de habilitação do Serpro · {HOJE.strftime('%d/%m/%Y')}</div>
  </div>
  <div style="background:#fff;border:1px solid #dce3ee;border-top:0;padding:6px 20px 20px;border-radius:0 0 14px 14px">
    <p style="margin:14px 0 0">{len(novos)} novidade{'s' if len(novos) != 1 else ''} desde o último aviso (marcadas com <b>NOVO</b>).
    Documentos vencidos já saíram da busca do site até a versão renovada ser colocada na pasta.</p>
    {bloco("Vencidas — fora do site", "#e52207", vencidas)}
    {bloco("Vencem em até 15 dias", "#b65d00", vencendo)}
    <p style="margin:22px 0 0"><a href="{SITE}" style="background:#003da5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:700">Abrir o Habilita</a></p>
    <p style="color:#5a6a83;font-size:12px;margin-top:18px">Alerta automático e gratuito do Habilita, enviado às 8h só quando há novidade (cada documento avisa aos 15, 7 e 1 dia e quando vence).
    Datas lidas no próprio PDF ou, quando ele não traz, na tabela de vencimentos da pasta.</p>
  </div></div>"""
    return assunto, corpo


def main():
    previa = "--previa" in sys.argv
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {}
    lista = itens()
    chave = lambda i: f"{i['titulo']}|{i['ate']}|{i['etapa']}"
    novos = lista if previa else [i for i in lista if chave(i) not in estado]
    if not novos:
        print("sem novidade: nenhum e-mail")
        return
    assunto, corpo = montar(lista, novos)
    PREVIA.parent.mkdir(parents=True, exist_ok=True)
    PREVIA.write_text(f"<!-- {assunto} -->\n{corpo}", "utf-8")
    c = config()
    if previa or c.get("ATIVO") != "sim" or not c.get("SMTP_PASS") or not c.get("PARA"):
        print(f"prévia gerada (envio desligado): {PREVIA} — {assunto}")
        return
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = assunto, f"Habilita <{c['SMTP_USER']}>", c["PARA"]
    msg.set_content("Seu leitor de e-mail não mostra HTML. Abra " + SITE)
    msg.add_alternative(corpo, subtype="html")
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
        s.login(c["SMTP_USER"], c["SMTP_PASS"])
        s.send_message(msg)
    for i in novos:
        estado[chave(i)] = HOJE.isoformat()
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1))
    print(f"enviado para {c['PARA']}: {assunto}")


if __name__ == "__main__":
    main()
