/** The bytes of a file; a response that is not OK is an error, naming the url and the status. */
export default async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if(!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }

  return response.arrayBuffer();
}
