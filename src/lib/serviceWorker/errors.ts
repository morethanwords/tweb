export const get500ErrorResponse = () => new Response('', {
  status: 500,
  statusText: 'Internal Server Error',
  headers: {'Cache-Control': 'no-cache'}
});
