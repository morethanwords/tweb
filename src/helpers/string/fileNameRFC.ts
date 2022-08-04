export default function fileNameRFC(fileName: string) {
  // Make filename RFC5987 compatible
  return encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
}
