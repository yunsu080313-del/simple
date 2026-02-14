import express from 'express';
import multer from 'multer';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { SpeechClient } from '@google-cloud/speech';
import { Translate } from '@google-cloud/translate/build/src/v2';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(cors());

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/';
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
// app.use(express.json()); // Enable JSON body parsing for API requests - Temporarily disabled for debugging req.file

// Instantiates clients
const speechClient = new SpeechClient();
const translateClient = new Translate();
const textToSpeechClient = new TextToSpeechClient();

app.post('/upload', (req, res) => {
  upload.single('video')(req, res, async (err) => { // Use async here for await calls
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading.
      console.error('Multer error:', err);
      return res.status(500).send({ message: `Multer error: ${err.message}` });
    } else if (err) {
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
    const audioOutputPath = path.join('temp', `${path.parse(req.file.filename).name}.mp3`);
    const targetLanguage = req.body.lang; // Get target language from frontend

    fs.mkdirSync('temp', { recursive: true }); // Ensure temp directory exists

    ffmpeg(videoPath)
      .output(audioOutputPath)
      .on('end', async () => {
        console.log('Audio extraction finished.');

        // Read the audio file
        const audioBytes = fs.readFileSync(audioOutputPath).toString('base64');

        const audio = {
          content: audioBytes,
        };
        const config = {
          encoding: 'MP3' as const,
          sampleRateHertz: 16000,
          languageCode: 'en-US', // Assuming English for source language for now
        };
        const request = {
          audio: audio,
          config: config,
        };

        try {
          const [sttResponse] = await speechClient.recognize(request);
          const transcription = sttResponse.results
            ?.map(result => result.alternatives?.[0]?.transcript)
            .join('\n');

          if (!transcription) {
            return res.status(500).send('Could not transcribe audio.');
          }

          console.log(`Transcription: ${transcription}`);

          // Translate the transcribed text
          const [translation] = await translateClient.translate(transcription, targetLanguage);
          console.log(`Translated text: ${translation}`);

          // Synthesize speech from the translated text
          const ttsRequest = {
            input: { text: translation as string },
            voice: { languageCode: targetLanguage, ssmlGender: 'NEUTRAL' as const },
            audioConfig: { audioEncoding: 'MP3' as const },
          };

          const [ttsResponse] = await textToSpeechClient.synthesizeSpeech(ttsRequest);
          const translatedAudioPath = path.join('temp', `${path.parse(req.file!.filename).name}-${targetLanguage}.mp3`);
          fs.writeFileSync(translatedAudioPath, ttsResponse.audioContent as Uint8Array, 'binary');
          console.log(`Translated audio saved to: ${translatedAudioPath}`);

          // Merge translated audio with original video
          const dubbedVideoPath = path.join('output', `${path.parse(req.file!.filename).name}-dubbed-${targetLanguage}.mp4`);
          ffmpeg(videoPath)
            .addInput(translatedAudioPath)
            .outputOptions('-c:v copy') // Copy video stream
            .outputOptions('-c:a aac')  // Encode audio to aac
            .outputOptions('-map 0:v:0')// Map video stream from first input
            .outputOptions('-map 1:a:0')// Map audio stream from second input
            .on('end', () => {
              console.log('Video dubbing finished.');
              res.json({ dubbedVideoUrl: `/output/${path.basename(dubbedVideoPath)}` }); // Send URL to client
            })
            .on('error', (err) => {
              console.error('Error during video dubbing:', err);
              res.status(500).send('Error during video dubbing.');
            })
            .save(dubbedVideoPath);


        } catch (error) {
          console.error('Error during processing:', error);
          res.status(500).send('Error during processing.');
        }
      })
      .on('error', (err) => {
        console.error('Error during audio extraction:', err);
        res.status(500).send('Error during audio extraction.');
      })
      .run();
  });
});

// Serve static files from the 'output' directory as well, so the client can access the dubbed video
app.use('/output', express.static(path.join(__dirname, '../../output')));

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
