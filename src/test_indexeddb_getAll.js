var perf = performance.now();
appUsersManager.storage.storage.getAll().then(values => { 
    console.log('getAll', performance.now() - perf);
});

var perfS = performance.now();
appStorage.storage.get('users').then(values => {
    console.log('get', performance.now() - perfS);
});

var user = appUsersManager.getUser();
var users = {};
for(var i = 0; i < 10000; ++i) {
  var u = Object.assign({}, user);
  u.id = i;
  users[i] = u;
}

appUsersManager.storage.set(users);
appStorage.storage.set('users', users);

var types = {}; 
appStateManager.neededPeers.forEach((value, key) => {
    [...value].forEach(type => {
        if(!types[type]) types[type] = [];
        types[type].push(key);
    });
});