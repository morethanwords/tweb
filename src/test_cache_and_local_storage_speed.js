{
  console.time('open');
  caches.open('sessions').then(cache => {
    console.timeEnd('open');
    cache.put('/state', new Response(JSON.stringify(appStateManager.state), {headers: {'Content-Type': 'application/json'}}));
  });

  console.time('match');
  caches.open('sessions').then(async(cache) => {
    const response = await cache.match('/state');
    const promise = response.json();
    promise.then((json) => {
      console.timeEnd('match');
    });
  });

  console.time('getItem');
  const value = JSON.parse(localStorage.getItem('state'));
  console.timeEnd('getItem');
}
