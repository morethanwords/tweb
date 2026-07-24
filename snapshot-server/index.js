const express = require('express');
const fs = require('fs');
const path = require('path');

const {parser} = require('stream-json');
const {streamObject} = require('stream-json/streamers/StreamObject');


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
app.get('/api/snapshots', async(req, res) => {
  const jsonFiles = fs.readdirSync(SNAPSHOT_DIR)
  .filter(f => f.endsWith('.json'));

  const meta = await Promise.all(jsonFiles.map(async f => ({
    name: f,
    comment: await getComment(f),
    timestamp: fs.statSync(path.join(SNAPSHOT_DIR, f)).mtimeMs
  })));

  const sorted = meta
  .sort((a, b) => b.timestamp - a.timestamp);

  res.json(sorted);
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

// The filename arrives URL-decoded off the route, so `..%2f..%2f` would otherwise walk
// straight out of the snapshots folder and into fs.readFileSync / fs.unlinkSync.
// Reduce it to a bare basename and verify the result is still inside SNAPSHOT_DIR.
function resolveSnapshotPath(name) {
  const filename = path.basename(name || '');
  if(!filename || filename === '.' || filename === '..') {
    return null;
  }

  const filepath = path.resolve(SNAPSHOT_DIR, filename);
  if(!filepath.startsWith(path.resolve(SNAPSHOT_DIR) + path.sep)) {
    return null;
  }

  return filepath;
}

// Load a snapshot by filename
app.get('/api/snapshots/:filename', (req, res) => {
  const filepath = resolveSnapshotPath(req.params.filename);

  if(!filepath || !fs.existsSync(filepath)) {
    return res.status(404).json({error: 'Snapshot not found'});
  }

  const data = fs.readFileSync(filepath, 'utf-8');
  res.json(JSON.parse(data));
});

// Delete a snapshot by filename
app.delete('/api/snapshots/:filename', (req, res) => {
  const filepath = resolveSnapshotPath(req.params.filename);

  if(!filepath || !fs.existsSync(filepath)) {
    return res.status(404).json({error: 'Snapshot not found'});
  }

  fs.unlinkSync(filepath);
  res.json({success: true});
});

// Start server with optional port argument
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const portToUse = portArg ? parseInt(portArg.split('=')[1], 10) : PORT;

// Loopback only — this is a local dev tool with no authentication of any kind
app.listen(portToUse, '127.0.0.1', () => {
  console.log(`🟢 Server running at http://localhost:${portToUse}`);
});

function getFormattedDate() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  const time = [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('-');
  return `${date}_${time}`;
}

const getComment = (f) => new Promise((_resolve) => {
  const timeout = setTimeout(() => {resolve('')}, 500); // Don't let it stall

  const resolve = (value) => {
    _resolve(value);
    clearTimeout(timeout);
    pipeline.destroy(); // Stop once we get the value
  };

  const pipeline = fs.createReadStream(path.join(SNAPSHOT_DIR, f))
  .pipe(parser())
  .pipe(streamObject())

  // Assuming comment is positioned first in the json

  pipeline.on('data', ({key, value}) => {
    if(key === 'comment') resolve(value);
    else resolve('');
  });

  pipeline.on('close', () => {
    resolve('');
  });

  pipeline.on('error', () => {
    resolve('')
  });
});
