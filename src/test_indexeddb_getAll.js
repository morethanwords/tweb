{
  const perf = performance.now();
  appUsersManager.storage.storage.getAll().then(values => { 
    console.log('getAll', performance.now() - perf);
  });

  const perfS = performance.now();
  appStorage.storage.get('users').then(values => {
    console.log('get', performance.now() - perfS);
  });

  const user = appUsersManager.getUser();
  const users = {};
  for(let i = 0; i < 10000; ++i) {
    const u = Object.assign({}, user);
    u.id = i;
    users[i] = u;
  }

  appUsersManager.storage.set(users);
  appStorage.storage.set('users', users);

  const types = {}; 
  appStateManager.neededPeers.forEach((value, key) => {
    [...value].forEach(type => {
      if(!types[type]) types[type] = [];
      types[type].push(key);
    });
  });
}
