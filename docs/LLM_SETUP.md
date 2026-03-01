# LLM Integration Setup Guide

This guide explains how to set up local AI capabilities for enhanced outline generation in the Bible Study application.

## What is Ollama?

Ollama is a local LLM (Large Language Model) runner that lets you run AI models on your own computer, with no cloud dependency or API keys required.

## Benefits of LLM-Enhanced Outlines

- **Intelligent Structure**: AI analyzes your content and creates logical sections
- **Discussion Questions**: Automatically generates thoughtful questions for each section
- **Bible Reference Detection**: Identifies and extracts scripture references
- **Key Points Extraction**: Pulls out main theological points
- **Enhanced Analysis**: Deeper content understanding than rule-based parsing

## Installation Steps

### 1. Install Ollama

**Windows:**
1. Download Ollama from [https://ollama.ai](https://ollama.ai)
2. Run the installer
3. Ollama will start automatically and add a system tray icon

**Mac:**
```bash
brew install ollama
ollama serve
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama serve
```

### 2. Download a Model

Open PowerShell or Terminal and run:

```bash
# Recommended: Llama 3.1 (4.7GB) - Best balance of quality and speed
ollama pull llama3.1

# Alternative: Phi-3 (2.3GB) - Fastest, good for quick generation
ollama pull phi3

# Alternative: Mistral (4.1GB) - Great for structured tasks
ollama pull mistral

# Alternative: Gemma 2 (5.4GB) - Good quality, slightly larger
ollama pull gemma2
```

### 3. Verify Setup

Test that Ollama is working:

```bash
ollama list
```

You should see your installed models. Try a test:

```bash
ollama run llama3.1 "Generate a Bible study outline for John 3:16"
```

## Using LLM in the Editor

### Generating an Outline

1. Open the editor and write your lesson content
2. Click the **"Generate Outline"** button (tree icon in toolbar)
3. In the modal that opens:
   - Select **"AI-Enhanced (Requires Ollama)"**
   - Choose your preferred model
   - Click **"Generate Outline"**
4. Wait 30-60 seconds for AI analysis
5. Review the generated outline
6. Click **"Apply to Class"** to save it

### Standard vs AI Generation

| Feature | Standard | AI-Enhanced |
|---------|----------|-------------|
| Speed | Instant | 30-60 seconds |
| Requirements | None | Ollama + Model |
| Structure | Rule-based (headings) | AI-analyzed |
| Questions | Detects "?" | Generates thoughtful questions |
| Bible References | Pattern matching | Context-aware detection |
| Quality | Good | Excellent |

### Enhancing Existing Outlines

1. Generate outline using **Standard** method
2. Click **"Enhance with AI"** button
3. AI will add questions and improve existing structure
4. Best of both worlds: fast initial generation + AI enhancement

## Troubleshooting

### "Ollama is not running"

**Solution:**
- Windows: Check system tray for Ollama icon, or run `ollama serve` in PowerShell
- Mac/Linux: Run `ollama serve` in Terminal
- Verify: Visit [http://localhost:11434](http://localhost:11434) in browser

### "Model not found"

**Solution:**
```bash
ollama pull llama3.1
```

### Generation Takes Too Long

**Solutions:**
- Use a smaller model like `phi3` instead of `llama3.1`
- Shorten your content (AI works best with 500-2000 words)
- Check CPU usage - close other apps during generation

### Poor Quality Outlines

**Solutions:**
- Try a different model (llama3.1 or mistral are usually best)
- Ensure your content has clear structure and topic
- Use more specific content rather than generic text
- Include Bible verses in your content for better reference detection

### JSON Parse Errors

**Solution:**
- This occasionally happens with AI generation
- Click "Try Again" - usually works on second attempt
- Fall back to Standard generation if persistent
- Report model name if consistently problematic

## Hardware Requirements

### Minimum
- **CPU**: Modern multi-core processor
- **RAM**: 8GB (model runs in RAM)
- **Storage**: 5-10GB per model
- **Performance**: ~30-90 seconds per generation

### Recommended
- **CPU**: 8+ cores
- **RAM**: 16GB+
- **GPU**: NVIDIA GPU with 8GB+ VRAM (much faster!)
- **Storage**: 20GB for multiple models
- **Performance**: ~10-30 seconds per generation

### GPU Acceleration (Optional)

If you have an NVIDIA GPU, Ollama will automatically use it for much faster generation.

**Check GPU usage:**
```bash
ollama ps
```

Look for GPU memory usage. If not using GPU, you may need to install CUDA drivers.

## Model Comparison

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| phi3 | 2.3GB | Fastest | Good | Quick drafts, slower PCs |
| mistral | 4.1GB | Fast | Great | Structured content |
| llama3.1 | 4.7GB | Medium | Excellent | Best all-around choice |
| gemma2 | 5.4GB | Slower | Excellent | When quality is priority |

## Privacy & Security

✅ **Fully Local**: All processing happens on your computer  
✅ **No Internet**: Works completely offline  
✅ **No Tracking**: No data sent to external servers  
✅ **No API Keys**: No accounts or subscriptions needed  
✅ **Private**: Your Bible study content stays private  

## Advanced Configuration

### Custom Model Settings

Edit `assets/js/llmService.js` to customize:

```javascript
const LLM_CONFIG = {
    baseUrl: 'http://localhost:11434',  // Change if Ollama on different port
    defaultModel: 'llama3.1',           // Your preferred model
    timeout: 60000,                     // Increase for slower PCs
    temperature: 0.7                    // 0-1, higher = more creative
};
```

### Using Different Ollama Instance

If running Ollama on a different computer or port:

```javascript
baseUrl: 'http://192.168.1.100:11434'  // Remote Ollama server
```

## Future Features

Coming soon:
- ✨ Auto-generate discussion questions for existing sections
- ✨ Suggest Bible verse references based on topic
- ✨ Summarize long lessons
- ✨ Generate study notes from video transcripts
- ✨ Create quiz questions
- ✨ Improve answer suggestions

## Support

If you encounter issues:
1. Check Ollama is running: `ollama list`
2. Check browser console for errors (F12)
3. Try Standard generation as fallback
4. Restart Ollama service
5. Re-pull the model: `ollama pull llama3.1`

## Resources

- [Ollama Website](https://ollama.ai)
- [Ollama Documentation](https://github.com/ollama/ollama/blob/main/README.md)
- [Available Models](https://ollama.ai/library)
- [Model Cards](https://ollama.ai/library/llama3.1)

## Cost

**FREE**: Ollama and all models are completely free and open source. No subscriptions, no API costs.

---

**Ready to try it?** Start Ollama, pull a model, and click the Generate Outline button! 🚀
