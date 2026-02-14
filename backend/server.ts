import express from 'express';
import multer from 'multer';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import cors from 'cors';

import { SpeechClient } from '@google-cloud/speech';
import { Translate } from '@google-cloud/translate/build/src/v2';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const app = express();
const port = process.env.PORT || 3000;

ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');

['uploads', 'temp', 'output'].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, 'video-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024 // Cloud Run 안전용 (30MB)
  }
});

const speechClient = new SpeechClient();
const translateClient = new Translate();
const ttsClient = new TextToSpeechClient();

app.post('/upload', upload.single('video'), async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).send('파일 없음');
    }

    const videoPath = req.file.path;
    const baseName = path.parse(req.file.filename).name;
    const audioPath = `temp/${baseName}.mp3`;
    const translatedAudioPath = `temp/${baseName}-translated.mp3`;
    const outputVideoPath = `output/${baseName}-dubbed.mp4`;

    const targetLang = req.body.lang || 'ko';

    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioFrequency(16000)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    console.log('오디오 추출 완료');

    const audioBytes = fs.readFileSync(audioPath).toString('base64');

    const [sttRes] = await speechClient.recognize({
      audio: { content: audioBytes },
      config: {
        encoding: 'MP3',
        sampleRateHertz: 16000,
        languageCode: 'en-US'
      }
    });

    const transcript = sttRes.results
      ?.map(r => r.alternatives?.[0]?.transcript)
      .join('\n');

    if (!transcript) throw new Error('STT 실패');

    console.log('텍스트:', transcript);


    const [translated] = await translateClient.translate(
      transcript,
      targetLang
    );

    console.log('번역:', translated);


    const [ttsRes] = await ttsClient.synthesizeSpeech({
      input: { text: translated },
      voice: {
        languageCode: targetLang,
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    });

    fs.writeFileSync(
      translatedAudioPath,
      ttsRes.audioContent as Uint8Array,
      'binary'
    );

    console.log('TTS 완료');


    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .addInput(translatedAudioPath)
        .outputOptions([
          '-map 0:v',
          '-map 1:a',
          '-c:v copy',
          '-c:a aac'
        ])
        .save(outputVideoPath)
        .on('end', resolve)
        .on('error', reject);
    });

    console.log('더빙 완료');

    res.json({
      success: true,
      url: `/output/${path.basename(outputVideoPath)}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('처리 실패');
  }
});


app.use('/output', express.static('output'));


app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
