"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = __importDefault(require("fs"));
const speech_1 = require("@google-cloud/speech");
const v2_1 = require("@google-cloud/translate/build/src/v2");
const text_to_speech_1 = require("@google-cloud/text-to-speech");
const app = (0, express_1.default)();
const port = 3000;
// Set up multer for file uploads
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});
// Serve the frontend
app.use(express_1.default.static(path_1.default.join(__dirname, '../frontend/dist')));
// app.use(express.json()); // Enable JSON body parsing for API requests - Temporarily disabled for debugging req.file
// Instantiates clients
const speechClient = new speech_1.SpeechClient();
const translateClient = new v2_1.Translate();
const textToSpeechClient = new text_to_speech_1.TextToSpeechClient();
app.post('/upload', (req, res) => {
    upload.single('video')(req, res, (err) => __awaiter(void 0, void 0, void 0, function* () {
        if (err instanceof multer_1.default.MulterError) {
            // A Multer error occurred when uploading.
            console.error('Multer error:', err);
            return res.status(500).send({ message: `Multer error: ${err.message}` });
        }
        else if (err) {
            // An unknown error occurred when uploading.
            console.error('Unknown upload error:', err);
            return res.status(500).send({ message: `Unknown upload error: ${err.message}` });
        }
        console.log('req.file:', req.file); // Debugging line
        console.log('req.body:', req.body); // Debugging line
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }
        const videoPath = req.file.path;
        const audioOutputPath = path_1.default.join('temp', `${path_1.default.parse(req.file.filename).name}.mp3`);
        const targetLanguage = req.body.lang; // Get target language from frontend
        (0, fluent_ffmpeg_1.default)(videoPath)
            .output(audioOutputPath)
            .on('end', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            console.log('Audio extraction finished.');
            // Read the audio file
            const audioBytes = fs_1.default.readFileSync(audioOutputPath).toString('base64');
            const audio = {
                content: audioBytes,
            };
            const config = {
                encoding: 'MP3',
                sampleRateHertz: 16000,
                languageCode: 'en-US', // Assuming English for source language for now
            };
            const request = {
                audio: audio,
                config: config,
            };
            try {
                const [sttResponse] = yield speechClient.recognize(request);
                const transcription = (_a = sttResponse.results) === null || _a === void 0 ? void 0 : _a.map(result => { var _a, _b; return (_b = (_a = result.alternatives) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.transcript; }).join('\n');
                if (!transcription) {
                    return res.status(500).send('Could not transcribe audio.');
                }
                console.log(`Transcription: ${transcription}`);
                // Translate the transcribed text
                const [translation] = yield translateClient.translate(transcription, targetLanguage);
                console.log(`Translated text: ${translation}`);
                // Synthesize speech from the translated text
                const ttsRequest = {
                    input: { text: translation },
                    voice: { languageCode: targetLanguage, ssmlGender: 'NEUTRAL' },
                    audioConfig: { audioEncoding: 'MP3' },
                };
                const [ttsResponse] = yield textToSpeechClient.synthesizeSpeech(ttsRequest);
                const translatedAudioPath = path_1.default.join('temp', `${path_1.default.parse(req.file.filename).name}-${targetLanguage}.mp3`);
                fs_1.default.writeFileSync(translatedAudioPath, ttsResponse.audioContent, 'binary');
                console.log(`Translated audio saved to: ${translatedAudioPath}`);
                // Merge translated audio with original video
                const dubbedVideoPath = path_1.default.join('output', `${path_1.default.parse(req.file.filename).name}-dubbed-${targetLanguage}.mp4`);
                (0, fluent_ffmpeg_1.default)(videoPath)
                    .addInput(translatedAudioPath)
                    .outputOptions('-c:v copy') // Copy video stream
                    .outputOptions('-c:a aac') // Encode audio to aac
                    .outputOptions('-map 0:v:0') // Map video stream from first input
                    .outputOptions('-map 1:a:0') // Map audio stream from second input
                    .on('end', () => {
                    console.log('Video dubbing finished.');
                    res.json({ dubbedVideoUrl: `/output/${path_1.default.basename(dubbedVideoPath)}` }); // Send URL to client
                })
                    .on('error', (err) => {
                    console.error('Error during video dubbing:', err);
                    res.status(500).send('Error during video dubbing.');
                })
                    .save(dubbedVideoPath);
            }
            catch (error) {
                console.error('Error during processing:', error);
                res.status(500).send('Error during processing.');
            }
        }))
            .on('error', (err) => {
            console.error('Error during audio extraction:', err);
            res.status(500).send('Error during audio extraction.');
        })
            .run();
    }));
});
// Serve static files from the 'output' directory as well, so the client can access the dubbed video
app.use('/output', express_1.default.static(path_1.default.join(__dirname, '../output')));
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
