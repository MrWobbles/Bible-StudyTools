const fs = require('fs');
fetch('https://open.spotify.com/playlist/74MtXE0vpNoYFJmNfhXq4g')
  .then(r => r.text())
  .then(h => {
    const s = h.indexOf('<script id="initial-state" type="text/plain">');
    if (s === -1) return console.log('no state');
    const e = h.indexOf('</script>', s);
    const b64 = h.substring(s + 45, e);
    const jsonStr = Buffer.from(b64, 'base64').toString('utf8');
    fs.writeFileSync('test_spotify.json', jsonStr);
    console.log('Done');
  })
  .catch(console.error);
