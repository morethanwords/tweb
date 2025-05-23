# Storage snapshot manager mini-app

Take and manage snapshots of the local storage and indexed DB.

### Starting the app

First, shut down the dev server of the main app, as we don't want anything happening in the background while we do our dirty stuff here.

```sh
cd ./snapshot-server

pnpm start --port=8080 # Make sure the port matches your usual development port, don't specify if you want the 8080 default
```

Go to `http://localhost:8080`, then in `chrome://inspect` (or your browser's equivalent), just in case check if there is no active service worker, or any other workers for the localhost if there are any. Note that the workers may interfere with the read/write operations in the indexed DB.

Here you can take and manage snapshots of the local storage and indexed DB, that will be saved locally under `./snapshot-server/snapshots/**`.

Be careful and don't spam any button, these operations can take some time so use this at your own risk. If you don't get the success message after clicking the `Load` button after at most a few seconds, it is likely there is a service worker running in the background.
