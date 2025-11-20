import fetch from "node-fetch";
import Parser from "rss-parser";
import fs from "fs";
import express from "express";
import "dotenv/config";

import { SOURCES } from "./sources.js";
import { Client, GatewayIntentBits } from "discord.js";

const parser = new Parser();
const postedPath = "./noticiasPosteadas.json";
const lastRunFile = "./lastRun.json";

// ===============================
// FUNCIONES AUXILIARES
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

function getLastRun() {
    if (!fs.existsSync(lastRunFile)) return 0;
    const data = JSON.parse(fs.readFileSync(lastRunFile));
    return new Date(data.lastRun).getTime();
}

function saveLastRun() {
    fs.writeFileSync(lastRunFile, JSON.stringify({ lastRun: new Date() }));
}

// ===============================
// DISCORD CLIENT
// ===============================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===============================
// POSTEAR EN DISCORD
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
// SCRAPER DE FEEDS
// ===============================
let posted = loadPosted();

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

        for (const noticia of nuevas) {
            await postToDiscord(noticia, noticia.source);
            posted.push(cleanLink(noticia.link));
        }

        savePosted(posted);

    } catch (err) {
        console.error("❌ Error general al revisar feeds:", err);
    }
}

// ===============================
// AUTOEJECUCIÓN CON LASTRUN
// ===============================
async function tryCheckFeeds() {
    const now = Date.now();
    const lastRun = getLastRun();
    const INTERVAL = 10 * 60 * 1000; // 10 minutos, cambiar a 3*60*60*1000 para 3 horas

    if (now - lastRun >= INTERVAL) {
        await checkFeeds();
        saveLastRun();
    }
}

// ===============================
// EXPRESS SERVER
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot de noticias corriendo 🚀");
});

app.get("/runFeeds", async (req, res) => {
    await tryCheckFeeds();
    res.send("✅ Feeds revisados");
});

app.listen(PORT, () => {
    console.log(`🌐 Web service escuchando en puerto ${PORT}`);
});

// ===============================
// LOGIN DISCORD
// ===============================
client.login(process.env.DISCORD_TOKEN);

client.on("ready", () => {
    console.log(`🤖 Bot iniciado como ${client.user.tag}`);
    tryCheckFeeds(); // primer check al iniciar
    setInterval(tryCheckFeeds, 60 * 1000); // revisar cada minuto
});
