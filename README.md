# Bible Study Tools

An interactive Bible study presentation system with synchronized video playback and teacher controls.

## Project Structure

```
Bible-StudyTools/
├── index.html              # Student/display view (show on TV/projector)
├── teacher.html            # Presenter control panel (keep on laptop)
├── assets/
│   ├── css/
│   │   ├── student.css     # Styles for student view
│   │   └── teacher.css     # Styles for teacher view
│   ├── js/
│   │   ├── config.js       # Video and pause point configuration
│   │   ├── student.js      # Student view functionality
│   │   └── teacher.js      # Teacher control panel functionality
│   ├── images/             # Store images here
│   └── video/              # Store video files here (if needed)
└── docs/
    ├── README.md           # Class-specific documentation
    ├── SERVE.md            # Server setup instructions
    └── serve.py            # Development server script
```

## Quick Start

1. **Configure your class**: Edit `assets/js/config.js` to set your video ID and pause points
2. **Open the display view**: Open `index.html` on your TV or projector
3. **Open the teacher view**: Open `teacher.html` on your laptop
4. **Control remotely**: Use the buttons in teacher view to control the display

## Creating New Classes

To create a new class:

1. Copy `index.html` and `teacher.html` (e.g., `index-class2.html`, `teacher-class2.html`)
2. Create a new config file (e.g., `assets/js/config-class2.js`)
3. Update the script src in both HTML files to reference your new config
4. Customize the content and pause points

The CSS and JS files are shared, making it easy to maintain consistent styling across all classes.

## Development

To run a local server for testing:

```bash
python docs/serve.py
```

Then open `http://localhost:8000` in your browser.

## Features

- **Synchronized controls**: Control the display screen from your laptop
- **Planned pause points**: Automatically pause at predetermined timestamps
- **Rich text notes**: Keep presenter notes with formatting
- **Question prompts**: Store and manage discussion questions
- **Export/import**: Save and load your notes and questions

## Browser Compatibility

Works best in modern browsers with BroadcastChannel API support (Chrome, Firefox, Safari, Edge). Falls back to localStorage for cross-window communication if needed.
