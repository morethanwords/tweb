const snapshotBtn = document.getElementById('snapshotBtn');
const snapshotList = document.getElementById('snapshotList');
const snapshotComment = document.getElementById('snapshotComment');

snapshotBtn.addEventListener('click', async() => {
  const snapshot = await takeSnapshot();
  const res = await fetch('/api/snapshots', {
    method: 'POST',
    headers: {'Content-Type': 'text/plain'},
    body: JSON.stringify(snapshot, jsonReplacer)
  });
  if(res.ok) {
    alert('Snapshot saved successfully!');
    loadSnapshots();
  } else {
    alert('Something went wrong while saving the snapshot: ' + res.statusText);
  }
});

snapshotComment.innerHTML = `Taken on ${new Date().toDateString()}`;

async function takeSnapshot() {
  const localStorageData = {};
  for(let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    localStorageData[key] = localStorage.getItem(key);
  }

  const indexedDBData = {};
  const dbs = await indexedDB.databases?.() || [];

  for(const {name} of dbs) {
    if(!name) continue;

    indexedDBData[name] = {};
    const db = await openDB(name);

    for(const storeName of db.objectStoreNames) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const entries = await getAllEntries(store);
      indexedDBData[name][storeName] = entries;
    }

    db.close();
  }

  return {
    comment: snapshotComment.innerHTML,
    localStorage: localStorageData,
    indexedDB: indexedDBData
  };
}

function openDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// function getAllRecords(store) {
//   return new Promise((resolve, reject) => {
//     const request = store.getAll();
//     request.onsuccess = () => resolve(request.result);
//     request.onerror = () => reject(request.error);
//   });
// }

async function loadSnapshots() {
  const res = await fetch('/api/snapshots');
  const snapshots = await res.json();

  snapshotList.innerHTML = '';

  snapshots.forEach(({name, comment}) => {
    const li = document.createElement('div');
    li.classList.add('snapshot-item')

    const nameEl = document.createElement('span');
    nameEl.textContent = name;
    nameEl.classList.add('snapshot-name');

    const commentEl = document.createElement('div');
    commentEl.innerHTML = comment;
    commentEl.classList.add('snapshot-item-comment');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.onclick = () => loadSnapshot(name);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = async() => {
      const confirmed = confirm('Are you sure you want to delete this snapshot?');
      if(!confirmed) return;
      await fetch(`/api/snapshots/${name}`, {method: 'DELETE'});
      alert('Snapshot successfully deleted');
      loadSnapshots();
    };

    li.appendChild(nameEl)
    li.appendChild(loadBtn);
    li.appendChild(deleteBtn);
    snapshotList.appendChild(li);
    if((comment || '').trim?.()) snapshotList.appendChild(commentEl);
  });
}

window.onload = loadSnapshots;

async function loadSnapshot(filename) {
  if(!confirm(`Are you sure you want to load snapshot "${filename}"? This will overwrite your current storage.`)) {
    return;
  }

  const res = await fetch(`/api/snapshots/${filename}`);
  if(!res.ok) {
    alert('Failed to load snapshot');
    return;
  }

  const snapshotText = await res.text();
  const snapshot = JSON.parse(snapshotText, jsonReviver);

  // Restore localStorage
  localStorage.clear();
  for(const [key, value] of Object.entries(snapshot.localStorage || {})) {
    localStorage.setItem(key, value);
  }

  // Restore indexedDB
  await clearAllIndexedDB();

  for(const [dbName, stores] of Object.entries(snapshot.indexedDB || {})) {
    await restoreIndexedDB(dbName, stores);
  }

  alert('Snapshot loaded successfully!');
}

function clearAllIndexedDB() {
  return new Promise(async(resolve) => {
    const dbs = await indexedDB.databases?.() || [];
    let count = dbs.length;

    if(count === 0) resolve();

    for(const {name} of dbs) {
      if(!name) {
        count--;
        if(count === 0) resolve();
        continue;
      }
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => {
        count--;
        if(count === 0) resolve();
      };
      req.onerror = () => {
        console.warn(`Failed to delete indexedDB ${name}`);
        count--;
        if(count === 0) resolve();
      };
    }
  });
}

function restoreIndexedDB(dbName, stores) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Delete existing object stores if any
      Array.from(db.objectStoreNames).forEach(storeName => {
        db.deleteObjectStore(storeName);
      });

      // Create stores from snapshot
      for(const storeName of Object.keys(stores)) {
        db.createObjectStore(storeName/* , {keyPath: 'id', autoIncrement: false} */);
      }
    };

    req.onsuccess = async(event) => {
      const db = event.target.result;

      // Write all entries to each store
      try {
        for(const [storeName, entries] of Object.entries(stores)) {
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);

          for(const entry of entries) {
            store.put(entry.value, entry.key);
          }

          await tx.complete; // some browsers support promise on tx.complete, others don't
        }
      } catch(e) {
        console.error('Error restoring indexedDB data', e);
      }

      db.close();
      resolve();
    };

    req.onerror = () => reject(req.error);
  });
}

function jsonReplacer(key, value) {
  if(value instanceof Uint8Array) {
    return {
      __type: 'Uint8Array',
      data: Array.from(value) // convert to normal array for JSON
    };
  }
  return value;
}

function jsonReviver(key, value) {
  if(value && value.__type === 'Uint8Array' && Array.isArray(value.data)) {
    return new Uint8Array(value.data);
  }
  return value;
}

function getAllEntries(store) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if(cursor) {
        entries.push({key: cursor.key, value: cursor.value});
        cursor.continue();
      } else {
        resolve(entries);
      }
    };
    request.onerror = () => reject(request.error);
  });
}
