const express = require('express');
const app = express();
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

// --- CONFIGURATION FFMPEG ---
try {
    // On récupère le chemin du binaire installé à la racine
    const ffmpegPath = require('ffmpeg-static');
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log("MP3 App: FFmpeg configuré.");
} catch (e) {
    console.error("MP3 App: Erreur FFmpeg", e);
}

// --- FICHIERS STATIQUES ---
// Pour charger le style.css ou le script.js du dossier mp3
app.use(express.static(__dirname)); 
// Ou path.join(__dirname, 'public') si tu as un dossier public

// --- ROUTE PRINCIPALE ---
// ⚠️ ATTENTION : On met '/' et PAS '/mp3'
app.get('/', (req, res) => {
    // Envoie ton fichier HTML principal (ex: index.html)
    // Assure-toi que le fichier index.html existe dans le dossier mp3
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- EXEMPLE ROUTE UPLOAD ---
// Ici, l'URL finale sera /mp3/upload, mais on écrit juste /upload
app.post('/upload', (req, res) => {
    res.send('Route upload atteinte (à coder avec ta logique multer/ffmpeg)');
});

// --- EXPORT ---
module.exports = app;