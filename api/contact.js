export default async function handler(req, res) {
  const allowedOrigins = new Set([
    "https://valeyastudio.it",
    "https://www.valeyastudio.it"
  ]);
  const origin = req.headers.origin;

  res.setHeader("Vary", "Origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  } else if (origin) {
    return res.status(403).json({ ok: false, message: "Origine non autorizzata." });
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, message: "Metodo non consentito." });
  }

  const {
    nome, attivita, email, whatsapp, richiesta, messaggio, privacy, _honey
  } = req.body || {};

  if (_honey) return res.status(200).json({ ok: true });
  if (!nome || !email || !richiesta || privacy !== "on") {
    return res.status(400).json({ ok: false, message: "Controlla i campi obbligatori e il consenso privacy." });
  }

  const clean = (value, max = 2000) => String(value || "").trim().slice(0, max);
  const safeName = clean(nome, 120);
  const safeBusiness = clean(attivita, 160) || "Non indicata";
  const safeEmail = clean(email, 254);
  const safeWhatsapp = clean(whatsapp, 80) || "Non indicato";
  const safeRequest = clean(richiesta, 200);
  const safeMessage = clean(messaggio, 3000) || "Nessun messaggio aggiuntivo";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeEmail)) {
    return res.status(400).json({ ok: false, message: "Inserisci un indirizzo email valido per ricevere la conferma." });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Contact form is missing RESEND_API_KEY or RESEND_FROM_EMAIL.");
    return res.status(503).json({ ok: false, message: "Il servizio di invio non è ancora configurato. Riprova più tardi oppure scrivi a hello@valeyastudio.it." });
  }

  const esc = (value) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const details = [
    ["Nome", safeName],
    ["Attività", safeBusiness],
    ["Email", safeEmail],
    ["WhatsApp", safeWhatsapp],
    ["Richiesta", safeRequest],
    ["Messaggio", safeMessage]
  ];
  const rows = details.map(([label, value]) =>
    '<tr><td style="padding:12px 14px;border-bottom:1px solid #e9e5df;color:#77736d;font-size:12px;width:135px;vertical-align:top">' +
    esc(label) + '</td><td style="padding:12px 14px;border-bottom:1px solid #e9e5df;color:#25231f;font-size:13px;white-space:pre-wrap">' +
    esc(value) + '</td></tr>'
  ).join("");

  const shell = (eyebrow, heading, body) => `
    <div style="margin:0;background:#f7f5f1;padding:36px 12px;font-family:Arial,Helvetica,sans-serif;color:#25231f">
      <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e9e5df">
        <div style="padding:28px 32px;border-bottom:1px solid #e9e5df">
          <div style="font-family:Georgia,serif;font-size:25px;letter-spacing:1px">VALE<span style="color:#b49b76">✧</span>YA</div>
          <div style="margin-top:5px;font-size:9px;letter-spacing:3px;color:#77736d">STUDIO</div>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 12px;color:#9b8463;font-size:10px;font-weight:bold;letter-spacing:2px">${eyebrow}</p>
          <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:34px;font-weight:normal;line-height:1.15">${heading}</h1>
          ${body}
        </div>
        <div style="padding:18px 32px;border-top:1px solid #e9e5df;color:#888278;font-size:10px;letter-spacing:1px">VALEYA STUDIO · DIGITAL DESIGN · WEB · PRODOTTI DIGITALI</div>
      </div>
    </div>`;

  const ownerHtml = shell("NUOVA RICHIESTA DAL SITO", "Hai ricevuto una nuova richiesta", `
    <p style="font-size:14px;line-height:1.8">È arrivata una richiesta dal modulo di contatto di Valeya Studio.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px">${rows}</table>`);

  const customerHtml = shell("RICHIESTA RICEVUTA", "Grazie, " + esc(safeName) + "!", `
    <p style="font-size:14px;line-height:1.8">La tua richiesta è stata ricevuta correttamente.</p>
    <h2 style="margin:28px 0 12px;font-family:Georgia,serif;font-size:22px;font-weight:normal">Ecco cosa hai richiesto</h2>
    <table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:24px;font-size:13px;line-height:1.8;color:#77736d">Verrai ricontattato quanto prima possibile.</p>`);

  async function sendEmail(payload) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend email error:", response.status, data);
      throw new Error("EMAIL_SEND_FAILED");
    }
    return data;
  }

  try {
    await sendEmail({
      from,
      to: ["hello@valeyastudio.it"],
      reply_to: safeEmail,
      subject: "Nuova richiesta dal sito Valeya Studio: " + safeRequest,
      html: ownerHtml
    });
    await sendEmail({
      from,
      to: [safeEmail],
      subject: "Abbiamo ricevuto la tua richiesta · Valeya Studio",
      html: customerHtml
    });
    return res.status(200).json({ ok: true, message: "Richiesta inviata correttamente." });
  } catch {
    return res.status(502).json({ ok: false, message: "Non siamo riusciti a inviare la richiesta. Riprova tra poco oppure scrivi a hello@valeyastudio.it." });
  }
}
