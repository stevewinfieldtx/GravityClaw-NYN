import * as readline from "node:readline";
import { spawn, execSync, ChildProcess } from "node:child_process";
import { loadConfig } from "./config.js";
import { runAgentLoop } from "./llm.js";
import { getHistory, saveHistory } from "./memory.js";
import { ElevenLabsStreamer } from "./elevenlabs_stream.js";
import { transcribeAudio } from "./voice.js";

// Setup interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const config = loadConfig();
const TALK_USER_ID = "local_talk_user";
let isRecording = false;
let recorderProcess: ChildProcess | null = null;
let audioChunks: Buffer[] = [];

// Determine Windows DirectShow Audio Device
function getMicrophoneDevice(): string {
  try {
    const out = execSync("ffmpeg -list_devices true -f dshow -i dummy 2>&1", {
      encoding: "utf8",
    });
    const match = out.match(/"([^"]+)" \(audio\)/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err: any) {
    // execSync throws if exit code > 0, which happens here. We catch it to read stderr.
    const out = err.stderr ? err.stderr.toString() : err.stdout ? err.stdout.toString() : err.message;
    const match = out.match(/"([^"]+)" \(audio\)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  console.warn("⚠️ Could not automatically detect microphone name. Falling back to default.");
  return "default";
}

const micDevice = getMicrophoneDevice();

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  🎙️  NYN — Local Talk Mode");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`🎤 Input Device: ${micDevice}`);
console.log("Press [Enter] to start recording. Press [Enter] again to stop and send.\n");

rl.on("line", async () => {
  if (isRecording) {
    // Stop recording
    isRecording = false;
    process.stdout.write("\n⏹️ Stopping capture and transcribing... ");
    
    if (recorderProcess && recorderProcess.stdin) {
      // 'q' + newline tells ffmpeg to quit gracefully and flush the wav file.
      recorderProcess.stdin.write("q\n");
      recorderProcess.stdin.end();
    }
    return;
  }

  // Start recording
  isRecording = true;
  audioChunks = [];
  process.stdout.write("🔴 Recording... (Press [Enter] to stop) ");

  try {
    recorderProcess = spawn("ffmpeg", [
      "-f", "dshow",
      "-i", `audio=${micDevice}`,
      "-f", "wav",
      "-ar", "16000",
      "-ac", "1",
      "pipe:1"
    ], {
      // Give ffmpeg its own piped stdin so we can send 'q' to stop it cleanly.
      // Without this, recorderProcess.stdin is null and kill() doesn't work on Windows.
      stdio: ["pipe", "pipe", "ignore"],
    });

    recorderProcess.stdout!.on("data", (chunk: Buffer) => {
      audioChunks.push(chunk);
    });

    recorderProcess.on("close", async () => {
      if (audioChunks.length === 0) {
         console.log("\n⚠️ No audio captured.");
         return;
      }
      const audioBuffer = Buffer.concat(audioChunks);
      
      try {
        // 1. Transcribe Whisper (simulating an ogg upload by sending wav)
        const text = await transcribeAudio(config, audioBuffer, "capture.wav");
        console.log(`\n🗣️ You: ${text}\n`);
        
        if (!text.trim()) {
           console.log("⚠️ Did not catch anything. Try again.");
           return;
        }

        const history = getHistory(TALK_USER_ID);
        history.push({ role: "user", content: text });
        saveHistory(TALK_USER_ID, history);

        // 2. Setup streaming objects
        const streamer = new ElevenLabsStreamer(config);
        if (config.elevenLabsApiKey) {
          await streamer.connect();
        }

        process.stdout.write("🤖 NYN: ");

        // 3. Agent loop streaming
        const response = await runAgentLoop(config, history, (chunk) => {
           process.stdout.write(chunk);
           if (config.elevenLabsApiKey) streamer.streamText(chunk);
        });

        history.push({ role: "assistant", content: response.text });
        saveHistory(TALK_USER_ID, history);
        
        console.log("\n"); // Clear line
        
        if (config.elevenLabsApiKey) {
           await streamer.close();
        }
      } catch (err: any) {
        console.error("\n❌ Error:", err.message);
      }
      
      console.log("\nPress [Enter] to start recording.");
    });
  } catch (err: any) {
    console.error("Failed to spawn ffmpeg:", err);
    isRecording = false;
  }
});
