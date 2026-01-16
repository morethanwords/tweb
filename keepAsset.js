module.exports = function(asset) {
  if(asset.includes('.xml') 
    || asset.includes('version')
    || asset.includes('assets/')
    || asset.includes('changelogs/')
    || asset.includes('.webmanifest') 
    || asset.includes('.wasm')
    || asset.includes('rlottie-wasm')
    || asset.includes('Worker.min.js')
    || asset.includes('recorder.min.js')
    || asset.includes('snapshot.html')
    || asset.includes('.hbs')) return true;
  return false;
}
