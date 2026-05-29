const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// CONFIGURATION
const INPUT_FILE = 'mp3.mp3'; // Remplacez par votre fichier
const OUTPUT_DIR = './output_chunks';
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo en octets

// Créer le dossier de sortie s'il n'existe pas
if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR);
}

/**
 * Fonction pour obtenir les métadonnées du fichier
 */
function getFileMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format);
        });
    });
}

/**
 * Fonction principale
 */
async function splitAudio() {
    console.log(`🎤 Analyse du fichier : ${INPUT_FILE}...`);

    try {
        const metadata = await getFileMetadata(INPUT_FILE);
        const duration = metadata.duration; // Durée totale en secondes
        const bitrate = metadata.bit_rate;  // Bitrate en bits/seconde (ex: 128000)
        
        console.log(`⏱️  Durée totale : ${Math.floor(duration / 60)} min ${Math.floor(duration % 60)} sec`);
        console.log(`📊 Bitrate détecté : ${Math.round(bitrate / 1000)} kbps`);

        // CALCUL DE LA DURÉE DE CHAQUE SEGMENT
        // Formule : (Taille en bits) / (bits par seconde) = Secondes
        // On prend une marge de sécurité de 95% pour être sûr de ne pas dépasser 15Mo
        const safeSizeBits = (MAX_SIZE_BYTES * 8) * 0.95; 
        const segmentDuration = Math.floor(safeSizeBits / bitrate);

        console.log(`✂️  Découpage prévu tous les ${segmentDuration} secondes pour rester sous 15 Mo.`);

        // LANCEMENT DU DÉCOUPAGE
        ffmpeg(INPUT_FILE)
            .outputOptions([
                `-f segment`,                // Format segment
                `-segment_time ${segmentDuration}`, // Durée de chaque segment
                `-c copy`                    // Copie le codec (très rapide, pas de ré-encodage)
            ])
            .output(path.join(OUTPUT_DIR, 'chunk_%03d.mp3'))
            .on('end', () => {
                console.log('✅ Découpage terminé avec succès !');
                console.log(`📂 Les fichiers sont dans le dossier "${OUTPUT_DIR}"`);
            })
            .on('error', (err) => {
                console.error('❌ Erreur lors du découpage :', err);
            })
            .run();

    } catch (error) {
        console.error("Erreur critique:", error);
    }
}

splitAudio();