from telethon import TelegramClient, events, sync
from telethon.network import ConnectionTcpAbridged

import sys
print(sys.path)

# These example values won't work. You must get your own api_id and
# api_hash from https://my.telegram.org, under API Development.
api_id = 1025907
api_hash = '452b0359b988148995f22ff0f4229750'

client = TelegramClient('session_name', api_id, api_hash, connection=ConnectionTcpAbridged)
#client.start()
client.connect()
