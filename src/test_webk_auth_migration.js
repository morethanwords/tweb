(async function asd() {
  const auth = 1;
  const keys = ['dc', 'server_time_offset', 'xt_instance'];
  for(let i = 1; i <= 5; ++i) {
    keys.push(`dc${i}_server_salt`);
    keys.push(`dc${i}_auth_key`);
  }

  const values = await Promise.all(keys.map(key => appStorage.get(key)));
  keys.push('user_auth');
  values.push(typeof(auth) === 'number' ? {dcID: values[0] || 2, id: auth} : auth);

  const obj = {};
  keys.forEach((key, idx) => {
    obj[key] = values[idx];
  });

  window.exported = obj;
  console.log(obj);
})();

{
  copy(JSON.stringify(window.exported));

  const obj = JSON.parse();
  appStorage.set(obj);
}
