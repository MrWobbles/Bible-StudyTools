# Quick Start: AI Outline Generation

## Installation (5 minutes)

1. **Download Ollama**: https://ollama.ai
2. **Install and run** (opens automatically on Windows)
3. **Pull a model** (PowerShell):
   ```powershell
   ollama pull llama3.1
   ```
4. **Done!** The editor will detect Ollama automatically

## Using AI Outlines

### In the Editor:

1. Write your lesson content (headings, bullet points, paragraphs)
2. Click **Generate Outline** button (tree icon)
3. Choose **AI-Enhanced** option
4. Click **Generate Outline**
5. Wait ~30-60 seconds
6. Click **Apply to Class**

### What You Get:

✅ Logical section structure  
✅ Auto-generated discussion questions  
✅ Extracted Bible references  
✅ Key theological points identified  
✅ Professional formatting  

## Models Comparison

| Model | Size | Speed | Choose When... |
|-------|------|-------|----------------|
| **phi3** | 2.3GB | ⚡ Fastest | You need quick results |
| **llama3.1** | 4.7GB | ⭐ Best | Default choice (recommended) |
| **mistral** | 4.1GB | Fast | Good for structured content |
| **gemma2** | 5.4GB | Slower | Maximum quality needed |

## Two Workflows

### Option 1: Full AI
- Choose "AI-Enhanced"
- AI does everything
- Takes longer but fully automated

### Option 2: Hybrid
- Choose "Standard" (instant)
- Click "Enhance with AI"
- Fast initial structure + AI improvements

## Troubleshooting

**Not working?**
- Check Ollama is running (system tray icon)
- Run: `ollama list` to verify model installed
- Browser console (F12) for errors

**Too slow?**
- Use smaller model (phi3)
- Reduce content length
- Close other apps

**Need help?**
- See full guide: [LLM_SETUP.md](LLM_SETUP.md)

## Requirements

- Windows 10/11, macOS 10.15+, or Linux
- 8GB RAM minimum (16GB recommended)
- 5-10GB disk space per model
- Optional: NVIDIA GPU for speed boost

---

**Status**: ✅ Implemented and ready to use  
**Cost**: FREE (runs locally, no API fees)  
**Privacy**: 100% local, nothing sent to cloud
