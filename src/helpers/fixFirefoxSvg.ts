export default function fixFirefoxSvg(text: string) {
  const svgIndex = text.indexOf('<svg');
  if(svgIndex !== 0) {
    text = text.slice(svgIndex);
  }

  const [_, __, width, height] = text.match(/viewBox="(.+?)"/)[1].split(' ');
  text = text.replace(/>/, ` width="${width}" height="${height}">`).replace(/[^\x00-\x7F]/g, '');
  return text;
}
