const express = require('express');
const fs = require('fs');
const path = require('path');
// const bodyParser = require('body-parser');

const app = express();
const PORT = 8080;
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');

// Ensure snapshot folder exists
if(!fs.existsSync(SNAPSHOT_DIR)) {
  fs.mkdirSync(SNAPSHOT_DIR);
}

// app.use(bodyParser.json({limit: '100mb'})); // Accept large JSON payloads
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.text({type: 'text/plain', limit: '100mb'}));

// List all snapshots
app.get('/api/snapshots', (req, res) => {
  const getComment = (f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, f)))?.comment || '';
    } catch{
      return '';
    }
  }
  const files = fs.readdirSync(SNAPSHOT_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => ({
    name: f,
    comment: getComment(f),
    timestamp: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs
  }))
  .sort((a, b) => b.timestamp - a.timestamp);
  res.json(files);
});

// Save a new snapshot
app.post('/api/snapshots', (req, res) => {
  const data = req.body;
  const filename = `snapshot-${getFormattedDate()}.json`;
  const filepath = path.join(SNAPSHOT_DIR, filename);

  fs.writeFile(filepath, data, (err) => {
    if(err) {
      res.status = 500;
      res.json({message: 'something went wrong'});
    } else {
      res.json({success: true, filename});
    }
  });
});

// Load a snapshot by filename
app.get('/api/snapshots/:filename', (req, res) => {
  const {filename} = req.params;
  const filepath = path.join(SNAPSHOT_DIR, filename);

  if(!fs.existsSync(filepath)) {
    return res.status(404).json({error: 'Snapshot not found'});
  }

  const data = fs.readFileSync(filepath, 'utf-8');
  res.json(JSON.parse(data));
});

// Delete a snapshot by filename
app.delete('/api/snapshots/:filename', (req, res) => {
  const {filename} = req.params;
  const filepath = path.join(SNAPSHOT_DIR, filename);

  if(!fs.existsSync(filepath)) {
    return res.status(404).json({error: 'Snapshot not found'});
  }

  fs.unlinkSync(filepath);
  res.json({success: true});
});

// Start server with optional port argument
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const portToUse = portArg ? parseInt(portArg.split('=')[1], 10) : PORT;

app.listen(portToUse, () => {
  console.log(`🟢 Server running at http://localhost:${portToUse}`);
});

function getFormattedDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  const time = [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('-');
  return `${date}_${time}`;
}
