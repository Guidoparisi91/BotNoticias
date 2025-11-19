import fetch from "node-fetch";
import Parser from "rss-parser";
import fs from "fs";
import http from "http";
import "dotenv/config";

import { SOURCES } from "./sources.js";

const parser = new Parser();
const postedPath = "./noticiasPosteadas.json";

// ===============================
//   FUNCION PARA LIMPIAR LINKS
// ===============================
function cleanLink(url) {
    try {
        const u = new URL(url);
        u.search = ""; // elimina utm, tracking
        u.hash = "";   // elimina anclas
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
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ===============================
//      POSTEAR EN DISCORD
// ===============================
async function postToDiscord(newsItem, sourceName) {
    const channel = await client.channels.fetch(process.env.CHANNEL_ID);

    const message = `📰 **${newsItem.title}**  
🔗 ${newsItem.link}  
📝 *Fuente: ${sourceName}*`;

    await channel.send(message);
    console.log("📢 Noticia posteada:", newsItem.title);
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
                    link: cleanLink(item.link),  // <-- limpieza de link
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

        // Ordenar por fecha (más nueva primero)
        allNews.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

        // Filtrar solo las NO posteadas
        const nuevas = allNews.filter(item => !posted.includes(cleanLink(item.link)));

        if (nuevas.length === 0) {
            console.log("⛔ No hay noticias nuevas");
            return;
        }

        // Posteamos SOLO la más nueva
        const noticia = nuevas[0];

        await postToDiscord(noticia, noticia.source);

        // Agregar al archivo
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

    checkFeeds(); // chequeo inicial

    setInterval(checkFeeds, 10 * 60 * 1000); // 10 minutos
});

// ===============================
//     SERVER HTTP (para Render)
// ===============================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot de noticias corriendo\n");
}).listen(PORT, () => {
    console.log(`🌐 Servidor HTTP escuchando en puerto ${PORT}`);
});

// ===============================
//      LOGIN DE DISCORD
// ===============================
client.login(process.env.DISCORD_TOKEN);
