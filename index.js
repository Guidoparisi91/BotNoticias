import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import Parser from "rss-parser";
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import cron from "node-cron";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});
const parser = new Parser();

const archivoPosteadas = './noticiasPosteadas.json';
let noticiasPosteadas = [];
if (fs.existsSync(archivoPosteadas)) {
  noticiasPosteadas = JSON.parse(fs.readFileSync(archivoPosteadas, 'utf-8'));
}

// RSS feeds confiables en español
const rssFeeds = [
  'https://pressover.news/feed/',
  'https://www.xataka.com/categoria/videojuegos/rss2.xml'
];

// Palabras en inglés para filtrar
const palabrasIngles = ['game', 'online', 'virtual', 'play'];

// Scraping Vandal
async function scrapeVandal() {
  const url = 'https://vandal.elespanol.com/noticias/';
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const noticias = [];

  $('.article-list-item__title a').each((i, el) => {
    const title = $(el).text().trim();
    const link = $(el).attr('href');
    if (link && title) {
      noticias.push({
        title,
        link: link.startsWith('http') ? link : 'https://vandal.elespanol.com' + link,
        pubDate: new Date() // como Vandal no tiene fecha en RSS, usamos hora de scraping
      });
    }
  });

  return noticias;
}

// Scraping DEV
async function scrapeDEV() {
  const url = 'https://www.dev.org.es/noticias-a-eventos/noticias-dev/';
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const noticias = [];

  $('.entry-title a').each((i, el) => {
    const title = $(el).text().trim();
    const link = $(el).attr('href');
    if (link && title) {
      noticias.push({ title, link, pubDate: new Date() });
    }
  });

  return noticias;
}

// Obtener la noticia más reciente
function obtenerMasReciente(arr) {
  return arr.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))[0];
}

async function postearNoticias() {
  try {
    let todas = [];

    // RSS
    for (const feed of rssFeeds) {
      try {
        const rss = await parser.parseURL(feed);
        rss.items.forEach(item => {
          todas.push({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date()
          });
        });
      } catch (e) {
        console.error('Error RSS feed:', feed, e.message);
      }
    }

    // Scraping Vandal
    try {
      const vandalNews = await scrapeVandal();
      todas.push(...vandalNews);
    } catch (e) {
      console.error('Error scraping Vandal:', e.message);
    }

    // Scraping DEV
    try {
      const devNews = await scrapeDEV();
      todas.push(...devNews);
    } catch (e) {
      console.error('Error scraping DEV:', e.message);
    }

    // Filtrar ya posteadas
    let nuevas = todas.filter(n => !noticiasPosteadas.includes(n.link));

    // Filtrar inglés
    nuevas = nuevas.filter(n =>
      !palabrasIngles.some(p => n.title.toLowerCase().includes(p))
    );

    if (nuevas.length === 0) {
      console.log('No hay noticias nuevas.');
      return;
    }

    // Elegir la noticia más reciente
    const noticia = obtenerMasReciente(nuevas);
    const canal = await client.channels.fetch(process.env.CHANNEL_ID);
    await canal.send(`**${noticia.title}**\n${noticia.link}`);

    noticiasPosteadas.push(noticia.link);
    fs.writeFileSync(archivoPosteadas, JSON.stringify(noticiasPosteadas, null, 2));
    console.log('Noticia posteada:', noticia.title);

  } catch (e) {
    console.error('Error general al postear:', e);
  }
}

// Cada 3 horas
cron.schedule('0 */3 * * *', () => {
  postearNoticias();
});

client.on('clientReady', () => {
  console.log(`Bot iniciado como ${client.user.tag}`);
  postearNoticias();
});

client.login(process.env.DISCORD_TOKEN);


