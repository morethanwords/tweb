# Offline shell boundary

The served application may load only the local manifest's JS, CSS, fonts and images.
The server accepts GET/HEAD, rejects other methods and unknown paths, and serves no
source tree or fallback HTML. Production CSP forbids connections, workers, media,
frames, objects, forms and script evaluation. Browser tests record attempted forbidden
API use, including attempts blocked by CSP, before any application script runs.

All imported/callback candidate data is untrusted plain data. The strict validator
rejects unknown fields, unsafe IDs, invalid topology and resource-limit overflow.
Text uses DOM text/textarea rendering; there is no HTML interpretation, executable
expression, URL button action, provider callback, authentication or credential input.

Only the versioned document is downloadable. Export starts a local Blob download;
it does not assert successful filesystem storage. No permanent browser storage is used.
