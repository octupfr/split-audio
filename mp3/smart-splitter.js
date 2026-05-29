const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const INPUT_FILE = 'mp3.mp3'; // Votre fichier source
const OUTPUT_DIR = './smart_chunks';
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo
const SILENCE_THRESHOLD = '-30dB'; // Niveau sonore considéré comme silence
const SILENCE_DURATION = 2; // Durée min du silence en secondes

// Création du dossier
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

/**
 * 1. Analyse le fichier pour trouver les silences
 */
function detectSilences(filePath) {
    console.log("🕵️  Analyse des silences en cours (cela peut prendre un moment)...");
    return new Promise((resolve, reject) => {
        const silencePoints = [];
        // On ajoute 0 comme point de départ
        silencePoints.push(0);

        ffmpeg(filePath)
            .audioFilters(`silencedetect=noise=${SILENCE_THRESHOLD}:d=${SILENCE_DURATION}`)
            .format('null') // On ne veut pas de fichier de sortie, juste l'analyse
            .on('stderr', (line) => {
                // FFmpeg écrit les infos de silence dans stderr
                if (line.includes('silence_end')) {
                    // Exemple de ligne: [silencedetect @ ...] silence_end: 245.345 | silence_duration: 2.5
                    const match = line.match(/silence_end: ([0-9.]+)/);
                    if (match && match[1]) {
                        silencePoints.push(parseFloat(match[1]));
                    }
                }
            })
            .on('end', () => {
                console.log(`✅ Analyse terminée. ${silencePoints.length - 1} zones de silence trouvées.`);
                resolve(silencePoints);
            })
            .on('error', reject)
            .save('/dev/null'); // Sortie vers le néant (sur Windows ce sera géré automatiquement par fluent-ffmpeg souvent, sinon utiliser 'NUL')
    });
}

/**
 * 2. Récupère la durée totale et le bitrate
 */
function getMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            resolve(metadata.format);
        });
    });
}

/**
 * 3. Logique principale
 */
async function smartSplit() {
    try {
        // A. Récupérer les infos
        const metadata = await getMetadata(INPUT_FILE);
        const totalDuration = metadata.duration;
        const bitrate = metadata.bit_rate;
        
        // Calcul de la durée max sûre (Safety margin 95%)
        const maxDurationSec = Math.floor(((MAX_SIZE_BYTES * 8) * 0.95) / bitrate);
        console.log(`📏 Durée max par segment pour 15Mo : ~${maxDurationSec} secondes`);

        // B. Trouver les silences
        const silencePoints = await detectSilences(INPUT_FILE);
        // On ajoute la fin du fichier comme dernier point
        silencePoints.push(totalDuration);

        // C. Calculer les points de coupure
        let cutPoints = [];
        let currentStart = 0;

        while (currentStart < totalDuration) {
            // L'objectif idéal est currentStart + maxDurationSec
            let targetEnd = currentStart + maxDurationSec;
            
            // Si l'objectif dépasse la fin du fichier, on s'arrête à la fin
            if (targetEnd >= totalDuration) {
                cutPoints.push([currentStart, totalDuration]);
                break;
            }

            // Trouver le silence le plus proche AVANT la limite (targetEnd), mais APRÈS le début
            // On cherche le "silence_end" le plus grand qui est <= targetEnd
            let bestCut = -1;
            
            // On parcourt les silences pour trouver le meilleur candidat
            for (let t of silencePoints) {
                if (t > currentStart && t <= targetEnd) {
                    bestCut = t; // On met à jour, comme la liste est triée (temporellement), le dernier valide sera le plus proche de la limite
                }
            }

            // CAS DE SECOURS : Si aucun silence n'est trouvé dans cet intervalle (ex: musique continue pendant 15 min)
            if (bestCut === -1) {
                console.warn(`⚠️  Attention: Aucun silence trouvé entre ${currentStart.toFixed(0)}s et ${targetEnd.toFixed(0)}s. Coupure forcée.`);
                bestCut = targetEnd;
            }

            cutPoints.push([currentStart, bestCut]);
            currentStart = bestCut; // Le début du prochain morceau est la fin du précédent
        }

        console.log(`✂️  Plan de découpage généré : ${cutPoints.length} segments.`);

        // D. Exécuter les coupes
        // On le fait en série (un par un) pour ne pas surcharger le processeur
        for (let i = 0; i < cutPoints.length; i++) {
            const [start, end] = cutPoints[i];
            const fileName = `chunk_${String(i + 1).padStart(3, '0')}.mp3`;
            const outputPath = path.join(OUTPUT_DIR, fileName);
            const duration = end - start;

            console.log(`💾 Création segment ${i+1}/${cutPoints.length} : de ${start.toFixed(1)}s à ${end.toFixed(1)}s (Durée: ${duration.toFixed(1)}s)`);

            await new Promise((resolve, reject) => {
                ffmpeg(INPUT_FILE)
                    .setStartTime(start)
                    .setDuration(duration)
                    .outputOptions('-c copy') // Copie rapide sans ré-encodage
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
        }

        console.log("🎉 Terminé ! Tous les fichiers sont dans " + OUTPUT_DIR);

    } catch (e) {
        console.error("Erreur:", e);
    }
}

smartSplit();