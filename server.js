const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SHEET_URL = process.env.GOOGLE_SHEET_CSV_URL;

let catalogCache = null;
let lastFetch = 0;

async function getCatalog() {
  const now = Date.now();
  if (catalogCache && now - lastFetch < 300000) return catalogCache;
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();
    const lines = csv.trim().split("\n").slice(1);
    let text = "CATALOGO MOGI ACO:\n\n";
    lines.forEach(line => {
      const c = line.split(",").map(x => x.replace(/^"|"$/g,"").trim());
      if (c[0] && c[1]) text += `${c[1]} | ${c[2]} | ${c[3]} | ${c[4]} | ${c[5]==="sim"?"Em estoque":"Sob encomenda"}\n`;
    });
    catalogCache = text;
    lastFetch = now;
    return text;
  } catch(e) {
    return catalogCache || "Catalogo indisponivel.";
  }
}

async function getCatalogJSON() {
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();
    const lines = csv.trim().split("\n").slice(1);
    const groups = {};
    lines.forEach(line => {
      const c = line.split(",").map(x => x.replace(/^"|"$/g,"").trim());
      const grupo = c[0];
      const nome = c[1];
      const especificacao = c[2];
      const preco = c[3];
      const unidade = c[4];
      const estoque = c[5];
      if (!grupo || !nome) return;
      if (!groups[grupo]) groups[grupo] = [];
      groups[grupo].push({
        nome,
        especificacao,
        preco,
        unidade,
        estoque: estoque === "sim"
      });
    });
    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  } catch(e) {
    return [];
  }
}

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "Invalido" });
  try {
    const catalog = await getCatalog();
    const system = `Voce e a Mari, assistente virtual da Mogi Aco em Mogi das Cruzes, SP. Simpatica, direta, natural. Nunca usa menus numerados. Max 2 emojis. Respostas curtas. ${catalog} Regras: use o catalogo para responder precos. Para orcamentos colete produto/medida/quantidade. Diga que equipe confirma. Se pedir pessoa humana, diga que vai transferir. Sempre em portugues do Brasil.`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        system,
        messages
      })
    });
    const data = await response.json();
    res.json({ reply: data.content[0].text });
  } catch(e) {
    res.status(500).json({ error: "Erro interno" });
  }
});

app.get("/api/catalog", async (req, res) => {
  try {
    const catalog = await getCatalogJSON();
    res.json({ catalog });
  } catch(e) {
    res.status(500).json({ error: "Erro ao carregar catalogo" });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
