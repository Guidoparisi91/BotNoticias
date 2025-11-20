import fetch from "node-fetch";
import Parser from "rss-parser";
import fs from "fs";
import express from "express";
import "dotenv/config";

import { SOURCES } from "./sources.js";

import { Client, GatewayIntentBits } from "discord.js";

const parser = new Parser();
const postedPath = "./noticiasPosteadas.json";

// ===============================
//   FUNCION PARA LIMPIAR LINKS
// ===============================
function cleanLink(url) {
    try {
        const u = new URL(url);
        u.search = "";
        u.hash = "";
        return u.toString();
    } catch {
        return url;
    }
}

// ===============================
//   CARGAR / CREAR ARCHIVO LOCAL
// ===============================
function loadPosted() {
    if (!fs.existsSync(postedPath)) {
        fs.writeFileSync(postedPath, JSON.stringify([]));
        return [];
    }
    return JSON.parse(fs.readFileSync(postedPath));
}

function savePosted(data) {
    fs.writeFileSync(postedPath, JSON.stringify(data, null, 2));
}

let posted = loadPosted();

// ===============================
//       DISCORD CLIENT
// ===============================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===============================
//      POSTEAR EN DISCORD
// ===============================
async function postToDiscord(newsItem, sourceName) {
    try {
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);
        const message = `📰 **${newsItem.title}**
🔗 ${newsItem.link}
📝 *Fuente: ${sourceName}*`;

        await channel.send(message);
        console.log("📢 Noticia posteada:", newsItem.title);
    } catch (err) {
        console.error("❌ Error al postear en Discord:", err);
    }
}

// ===============================
//       SCRAPER DE FEEDS
// ===============================
async function checkFeeds() {
    console.log("📡 Revisando feeds...");

    try {
        let allNews = [];

        for (const source of SOURCES) {
            try {
                const feed = await parser.parseURL(source.url);
                const items = feed.items.map(item => ({
                    title: item.title,
                    link: cleanLink(item.link),
                    isoDate: item.isoDate,
                    source: source.name
                }));

                allNews = allNews.concat(items);
                console.log(`✔ ${source.name} → OK (${items.length} noticias)`);
            } catch (err) {
                console.log(`❌ Error en "${source.name}":`, err.message);
            }
        }

        if (allNews.length === 0) {
            console.log("⛔ No se pudieron obtener noticias");
            return;
        }

        allNews.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
        const nuevas = allNews.filter(item => !posted.includes(cleanLink(item.link)));

        if (nuevas.length === 0) {
            console.log("⛔ No hay noticias nuevas");
            return;
        }

        const noticia = nuevas[0];
        await postToDiscord(noticia, noticia.source);

        posted.push(cleanLink(noticia.link));
        savePosted(posted);

    } catch (err) {
        console.error("❌ Error general al revisar feeds:", err);
    }
}

// ===============================
//      EJECUCIÓN CADA 10 MIN
// ===============================
client.once("ready", () => {
    console.log(`🤖 Bot iniciado como ${client.user.tag}`);

    checkFeeds(); // Ejecuta al iniciar
    setInterval(checkFeeds, 10 * 60 * 1000); // Cada 10 minutos
});

// ===============================
//     SERVER EXPRESS (Render fix)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot de noticias corriendo 🚀");
});

app.listen(PORT, () => {
    console.log(`🌐 Web service escuchando en puerto ${PORT}`);
});

// ===============================
//      LOGIN DE DISCORD
// ===============================
client.login(process.env.DISCORD_TOKEN);
