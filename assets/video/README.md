# Video Folder

Store locally downloaded video files here (NOT tracked in git).

## Important Notes

- **Videos are NOT tracked in git** due to file size
- Use YouTube links in `classes.json` whenever possible
- Only download videos locally if needed for offline use
- If you must download a video, store it here and reference the filename in `classes.json`

## Example References

In `classes.json`, prefer YouTube references:
```json
{
  "sources": [
    {
      "format": "youtube",
      "videoId": "QhVPBNBAGY0",
      "url": "https://youtu.be/QhVPBNBAGY0"
    }
  ]
}
```

For local video files (if needed):
```json
{
  "sources": [
    {
      "format": "local",
      "path": "assets/video/class1-presentation.mp4",
      "note": "Download from [source URL]"
    }
  ]
}
```
