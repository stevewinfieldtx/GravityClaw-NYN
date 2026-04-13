import WebSocket from "ws";
import { spawn } from "node:child_process";
import type { Config } from "./config.js";

interface ElevenLabsResponse {
  audio?: string;
  isFinal?: boolean;
}

export class ElevenLabsStreamer {
  private config: Config;
  private ws: WebSocket | null = null;
  private ffplay: any = null;
  private isGenerating = false;

  constructor(config: Config) {
    this.config = config;
  }

  public async connect(): Promise<void> {
    if (!this.config.elevenLabsApiKey) {
      throw new Error("Cannot stream audio: elevenLabsApiKey is not set in config.");
    }

    return new Promise((resolve, reject) => {
      const voiceId = this.config.elevenLabsVoiceId || "21m00Tcm4TlvDq8ikWAM"; // fallback to default voice
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=eleven_multilingual_v2`;
      
      this.ws = new WebSocket(url);
      
      this.ws.on("open", () => {
        // Send initial setup message with API key
        const initMessage = {
          text: " ",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          xi_api_key: this.config.elevenLabsApiKey,
        };
        this.ws?.send(JSON.stringify(initMessage));
        
        // Spawn ffplay to receive MP3 binary data
        // -i pipe:0 means read from stdin, -autoexit means close when done playing, -nodisp means no window
        this.ffplay = spawn("ffplay", ["-i", "pipe:0", "-autoexit", "-nodisp", "-volume", "512"]);
        
        this.ffplay.on("error", (err: any) => {
          console.error("❌ Failed to start ffplay. Make sure ffmpeg/ffplay is installed and in your PATH.", err);
        });

        resolve();
      });

      this.ws.on("message", (data) => {
        const response = JSON.parse(data.toString()) as ElevenLabsResponse;
        
        if (response.audio) {
          const audioBuffer = Buffer.from(response.audio, "base64");
          if (this.ffplay && this.ffplay.stdin) {
            this.ffplay.stdin.write(audioBuffer);
          }
        }
        
        if (response.isFinal) {
          this.isGenerating = false;
          if (this.ffplay && this.ffplay.stdin) {
             // Close stdin to signal EOF to ffplay
            this.ffplay.stdin.end();
          }
          this.ws?.close();
        }
      });

      this.ws.on("error", (err) => {
        console.error("❌ ElevenLabs WebSocket Error:", err);
        reject(err);
      });

      this.ws.on("close", () => {
        if (this.ffplay && this.ffplay.stdin && !this.ffplay.stdin.destroyed) {
          this.ffplay.stdin.end();
        }
      });
    });
  }

  public streamText(textChunk: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    // Add space to help elevenlabs chunk appropriately if chunking mid-word
    const payload = {
      text: textChunk + " ",
      try_trigger_generation: true,
    };
    
    this.ws.send(JSON.stringify(payload));
  }

  public async close(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const endMessage = {
      text: "",
    };
    this.ws.send(JSON.stringify(endMessage));
  }
}
