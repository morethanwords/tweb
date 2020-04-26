export const App = {
  id: 1025907,
  hash: '452b0359b988148995f22ff0f4229750',
  version: '0.3.0',
  domains: [] as string[],
  baseDcID: 2
};

export const Modes = {
  test: location.search.indexOf('test=1') > 0/*  || true */,
  debug: location.search.indexOf('debug=1') > 0,
  http: location.search.indexOf('http=1') > 0,
  ssl: location.search.indexOf('ssl=1') > 0 || location.protocol == 'https:' && location.search.indexOf('ssl=0') == -1,
  multipleConnections: true
};
