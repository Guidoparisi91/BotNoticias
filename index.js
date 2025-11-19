import dotenv from "dotenv";
import Parser from "rss-parser";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();
const parser = new Parser();

// =============================
//  CONFIGURACIÓN DE FUENTES
// =============================

const sources = [
  {
    name: "Pressover",
    url: "https://pressover.news/feed/"
  },
  {
    name: "3DJuegos",
    url: "https://www.3djuegos.com/rss/feeds/noticias"
  },
  {
    name: "Hobby Consolas",
    url: "https://feeds.weblogssl.com/hobbyconsolas"
  },
  {
    name: "Vandal",
    url: "https://vandal.elespanol.com/xml/rss/2.0/noticias.xml"
  },
  {
    name: "IGN Latam",
    url: "https://latam.ign.com/rss.xml"
  }
];

// Guardamos URLs de noticias ya posteadas
const posted = new Set();

// =============================
//  FUNCIÓN: Obtener noticias de cada fuente
// =============================
async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.url);

    return feed.items.map(item => ({
      source: source.name,
      title: item.title,
      url: item.link,
      date: new Date(item.pubDate || item.isoDate || Date.now())
    }));
  } catch (err) {
    console.error(`Error en RSS de ${source.name}:`, err.message);
    return [];
  }
}

// =============================
//  FUNCIÓN: Postear noticias en Discord
// =============================
async function postNews(client) {
  const channel = await client.channels.fetch(process.env.CHANNEL_ID);
  if (!channel) {
    console.error("❌ Error: Canal no encontrado.");
    return;
  }

  console.log("Buscando noticias…");

  let allNews = [];

  for (const source of sources) {
    const news = await fetchRSS(source);
    allNews.push(...news);
  }

  // Ordenar por fecha más reciente
  allNews.sort((a, b) => b.date - a.date);

  // Tomar solo la primera noticia no posteada
  for (const item of allNews) {
    if (!posted.has(item.url)) {
      posted.add(item.url);

      await channel.send(`📰 **${item.source}**  
**${item.title}**  
🔗 ${item.url}`);

      console.log(`Noticia posteada: ${item.title}`);
      break; // solo 1 noticia por ejecución
    }
  }
}

// =============================
//  INICIAR BOT
// =============================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once("clientReady", () => {
  console.log(`Bot iniciado como ${client.user.tag}`);

  postNews(client);

  // Intervalo: cada 3 horas (3*60*60*1000 ms)
  setInterval(() => postNews(client), 3 * 60 * 60 * 1000);
});

client.login(process.env.DISCORD_TOKEN);

