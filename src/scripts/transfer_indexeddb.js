// Функция для экспорта базы данных IndexedDB
async function exportIndexedDB(dbName) {
  return new Promise((resolve, reject) => {
    let request = indexedDB.open(dbName);
    
    request.onerror = function(event) {
      reject('Ошибка при открытии базы данных.');
    };
    
    request.onsuccess = function(event) {
      let db = event.target.result;
      let exportObject = {
        dbName: db.name,
        version: db.version,
        objectStores: {}
      };
      
      let transaction = db.transaction(db.objectStoreNames, 'readonly');
      transaction.onerror = function(event) {
        reject('Ошибка транзакции.');
      };
      
      transaction.oncomplete = function(event) {
        resolve(exportObject);
      };
      
      for(let storeName of db.objectStoreNames) {
        let objectStore = transaction.objectStore(storeName);
        let storeInfo = {
          data: [],
          keyPath: objectStore.keyPath,
          autoIncrement: objectStore.autoIncrement,
          indexes: []
        };
        
        // Получаем информацию об индексах
        for(let indexName of objectStore.indexNames) {
          let index = objectStore.index(indexName);
          storeInfo.indexes.push({
            name: index.name,
            keyPath: index.keyPath,
            unique: index.unique,
            multiEntry: index.multiEntry
          });
        }
        
        // Считываем все данные из хранилища
        let cursorRequest = objectStore.openCursor();
        
        cursorRequest.onerror = function(event) {
          reject('Ошибка курсора.');
        };
        
        cursorRequest.onsuccess = function(event) {
          let cursor = event.target.result;
          if(cursor) {
            storeInfo.data.push(cursor.value);
            cursor.continue();
          } else {
            exportObject.objectStores[storeName] = storeInfo;
          }
        };
      }
    };
  });
}

// Функция для импорта базы данных IndexedDB
async function importIndexedDB(data) {
  return new Promise((resolve, reject) => {
    let dbName = data.dbName;
    let version = data.version;
    
    // Удаляем существующую базу данных
    let deleteRequest = indexedDB.deleteDatabase(dbName);
    
    deleteRequest.onsuccess = deleteRequest.onerror = deleteRequest.onblocked = function() {
      proceed();
    };
    
    function proceed() {
      let openRequest = indexedDB.open(dbName, version);
      
      // Создаем хранилища и индексы
      openRequest.onupgradeneeded = function(event) {
        let db = event.target.result;
        
        for(let storeName in data.objectStores) {
          let storeInfo = data.objectStores[storeName];
          
          let objectStore;
          if(!db.objectStoreNames.contains(storeName)) {
            objectStore = db.createObjectStore(storeName, {
              keyPath: storeInfo.keyPath,
              autoIncrement: storeInfo.autoIncrement
            });
          } else {
            objectStore = event.transaction.objectStore(storeName);
          }
          
          for(let indexInfo of storeInfo.indexes) {
            if(!objectStore.indexNames.contains(indexInfo.name)) {
              objectStore.createIndex(indexInfo.name, indexInfo.keyPath, {
                unique: indexInfo.unique,
                multiEntry: indexInfo.multiEntry
              });
            }
          }
        }
      };
      
      openRequest.onsuccess = function(event) {
        let db = event.target.result;
        let transaction = db.transaction(Object.keys(data.objectStores), 'readwrite');
        
        transaction.onerror = function(event) {
          reject('Ошибка транзакции при импорте.');
        };
        
        transaction.oncomplete = function(event) {
          resolve();
        };
        
        // Вставляем данные в хранилища
        for(let storeName in data.objectStores) {
          let storeInfo = data.objectStores[storeName];
          let objectStore = transaction.objectStore(storeName);
          
          for(let item of storeInfo.data) {
            objectStore.put(item);
          }
        }
      };
      
      openRequest.onerror = function(event) {
        reject('Ошибка при открытии базы данных во время импорта.');
      };
    }
  });
}

(async function() {
  let data = await exportIndexedDB('tweb');
  let dataString = JSON.stringify(data);
  // Теперь вы можете сохранить dataString в файл или передать на другой домен
  console.log(dataString);
})();

(async function() {
  // Предположим, что dataString получена из предыдущего шага
  let data = JSON.parse(dataString);
  await importIndexedDB(data);
  console.log('Импорт завершен.');
})();