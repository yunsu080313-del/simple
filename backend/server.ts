import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";

import { SpeechClient } from "@google-cloud/speech";
import { Translate } from "@google-cloud/translate/build/src/v2";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

// ✅ Cloud Run → key.json 필요 없음
const speechClient = new SpeechClient();
const translateClient = new Translate();
const ttsClient = new TextToSpeechClient();

app.get("/", (req, res) => {
  res.send("Server OK");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = path.join(__dirname, "..", req.file.path);
    const audioBytes = fs.readFileSync(filePath).toString("base64");

    // ✅ 1. Speech to Text
    const [speechResponse] = await speechClient.recognize({
      audio: { content: audioBytes },
      config: {
        encoding: "WEBM_OPUS",
        sampleRateHertz: 48000,
        languageCode: "ko-KR",
      },
    });

    const text =
      speechResponse.results
        ?.map(r => r.alternatives?.[0]?.transcript)
        .join(" ") || "";

    // ✅ 2. Translate
    const [translated] = await translateClient.translate(text, "en");

    // ✅ 3. Text To Speech
    const [ttsResponse] = await ttsClient.synthesizeSpeech({
      input: { text: translated },
      voice: {
        languageCode: "en-US",
        ssmlGender: "NEUTRAL",
      },
      audioConfig: {
        audioEncoding: "MP3",
      },
    });

    const outputFile = `output-${Date.now()}.mp3`;
    fs.writeFileSync(outputFile, ttsResponse.audioContent as Buffer);

    res.json({
      original: text,
      translated,
      audioFile: outputFile,
    });

    fs.unlinkSync(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Processing failed" });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
