# VBS Script & SFX Linking Guide

## Overview
Each VBS control scene can now have an associated script with clickable text that triggers sound effects. This allows you to:
- Link text in scripts to SFX buttons
- Click script text during presentation to play audio effects
- Load scripts from Google Docs or paste formatted text
- Display scripts with formatted clickable regions

## Setup Workflow

### 1. Create a Scene with Script

#### Option A: Paste Script Content
1. Click **+ Add Scene** or edit an existing scene
2. Go to the **Script & Text Links** section
3. Click **Script Content** tab
4. Paste your script text into the textarea
5. Click **Preview** to see how it will look

#### Option B: Load from Google Docs
1. In your scene editor, go to **Google Doc** tab
2. Paste a public Google Docs share link (make sure it's readable)
3. Click **Load from Google Doc**
4. The text will be imported into the Script Content tab
5. Adjust formatting as needed

### 2. Link Text to Sound Effects

#### Setup SFX First
1. In the Sound Effects section, add your sound effects with labels:
   - **Label**: Display name (e.g., "Thunder", "Footsteps")
   - **URL**: Path to audio file (e.g., `/assets/audio/thunder.mp3`)
   - **Loop**: Check if sound should loop

#### Create Text Links
1. Click the **Link Text to SFX** tab
2. Read the script text in the preview area
3. **Highlight text** from the script that should trigger an SFX
4. The text will appear in "Selected Text"
5. Choose an SFX from the **Link to SFX** dropdown
6. Click **Create Link**
7. The link appears in "Active Links" below
8. Repeat for all text you want to link

#### Manage Links
- See all active links in the "Active Links" section
- Remove links by clicking the **Remove** button
- Script preview shows blue highlighted text for all links

### 3. Save and Test

1. Complete all scene details (title, video, texts, etc.)
2. Click **Save Scene**
3. Scene appears in the main controller
4. Script displays in the scene card with blue clickable links
5. Click any blue linked text to play the associated SFX

## Scene Display

### In Controller View
Each scene card shows:
- **Title** and sort order
- **Play Background** button (if video assigned)
- **Display Text** buttons (if any)
- **Script Section** (if script added) - blue text is clickable and plays SFX
- **SFX Buttons** (manual playback)
- **Edit** and **Delete** buttons

### Script Display
- Plain text renders as normal
- Linked text appears in blue, styled as a button
- Click any blue text to immediately play that SFX
- Script scrolls if longer than display area

## Advanced Usage

### Working with Google Docs
- Document must be **publicly shared** or have link sharing enabled
- Only text content is imported (formatting is not preserved)
- Export uses plain text format
- After importing, you can edit the text in the editor
- The Google Doc URL is saved for reference

### Formatting Tips
- Use line breaks in your script for readability
- Short, single words work best for clickable links
- Avoid linking very long text selections
- You can link the same text multiple times if needed (but it will only link to one SFX)

### Text Selection
- Click and drag to select text from the preview
- Selected text appears in the "Selected Text" field
- If nothing selected, you'll get an alert
- Works best with individual words or short phrases

## Data Storage

All script data is stored in the scene:
- `script_content`: Full text of the script
- `script_links`: Array of text-to-SFX mappings
- `google_doc_url`: Reference to original Google Doc (if used)

This allows you to edit and re-save scenes with script changes.

## Troubleshooting

**Q: Script text isn't showing up in the preview**
A: Click the "Preview" button after pasting content, or click the "Script Content" tab.

**Q: Blue links aren't appearing in the scene card**
A: Make sure you created links in the "Link Text to SFX" tab, then saved the scene.

**Q: Google Doc won't load**
A:
- Check that the URL is correct
- Ensure the document is publicly shared (File > Share > Anyone with link)
- Try copying the exact Google Docs link from the browser address bar

**Q: Selected text isn't being recognized**
A: Make sure you're highlighting text in the script preview area (the light box), not in the text editor.

**Q: SFX won't play when clicking linked text**
A:
- Verify the SFX is properly configured with a valid URL
- Check browser console for errors
- Make sure the audio file exists at the specified path

## Example Workflow

1. Create a scene: "Day 1 - Rainforest"
2. Add SFX:
   - Label: "Monkey" → `/assets/audio/monkey.mp3`
   - Label: "Rain" → `/assets/audio/rain.mp3` (Loop: checked)
   - Label: "Birds" → `/assets/audio/birds.mp3`
3. Paste script:
   ```
   A monkey swings through the trees!
   The rain falls hard and fast.
   Birds sing in the distance.
   ```
4. Link text:
   - "monkey" → Monkey SFX
   - "rain" → Rain SFX
   - "Birds" → Birds SFX
5. Save and click blue text during presentation to play effects

## API Details

**POST/PUT /api/vbs/scenes** now accepts:
```json
{
  "title": "Scene Title",
  "script_content": "Full script text",
  "script_links": [
    {
      "text_selection": "text to click",
      "sfx_label": "SFX Label"
    }
  ],
  "google_doc_url": "https://docs.google.com/...",
  ...other fields...
}
```
