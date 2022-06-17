// https://github.com/eelcohn/Telegram-API/wiki/Calculating-color-for-a-Telegram-user-on-IRC
/*
  HTML-color  IRC-color  Description
  #c03d33     4          red
  #4fad2d     3          green
  #d09306     7          yellow
  #168acd     10         blue
  #8544d6     6          purple
  #cd4073     13         pink
  #2996ad     11         sea
  #ce671b     5          orange
*/
const DialogColorsFg = ['#fc5c51', '#0fb297', '#d09306', '#3d72ed', '#895dd5', '#cd4073', '#00c1a6', '#fa790f'];
const DialogColors = ['red', 'green', 'yellow', 'blue', 'violet', 'pink', 'cyan', 'orange'];
const DialogColorsMap = [0, 7, 4, 1, 6, 3, 5];

export default function getPeerColorById(peerId: PeerId, pic = true) {
  if(!peerId) return '';

  const idx = DialogColorsMap[Math.abs(+peerId) % 7];
  const color = (pic ? DialogColors : DialogColorsFg)[idx];
  return color;
}
