from telethon import TelegramClient, events, sync
from telethon.network import ConnectionTcpAbridged
from telethon.network.mtprotostate import MTProtoState
from telethon.crypto.authkey import AuthKey

import struct
import logging
logging.basicConfig(level=logging.DEBUG)

# import sys
# print(sys.path)

# These example values won't work. You must get your own api_id and
# api_hash from https://my.telegram.org, under API Development.
api_id = 1025907
api_hash = '452b0359b988148995f22ff0f4229750'

client = TelegramClient('session_name', api_id, api_hash, connection=ConnectionTcpAbridged)
#client.start()
#client.connect()

authKey = AuthKey(bytes.fromhex("2c45ed62da34d41bc82b6ef660760d3b01cb80028b0c363633f1c40ec80d5f4ad9d4ddee646736b6a9465fd7258b8936dedde6a86c69b4a03277ed6c543ccfd31fa8fa9f9449d686b4822b54542c91255231ecfa6aed4a9896cdcc3d5491e7f1b7529cbff75597f262813ced7eb3b5ac1e7e6794ca7aa00c5ea4d1d714e7c276fb63e5f8a1742cf4707eace8a6ec2ed4dcceceabdc7fc92bd099c811931e0da337f1b0271d8ba33e7a4a22fa1e4a913d8220edb0dd3a810ed408f03fe5d7f2d5dd43db4272d314b20a22376c03b0a05423600f4d012e7196ce9b3c45b28a75dbfa053222f5c86d1c6a706a2fd68ca270fd9a6449df1fa15a21837d34f4cf4e95"))
state = MTProtoState(authKey, loggers=client._log)

state.salt = struct.unpack('q', bytes.fromhex("d1b37eebb4997ca9"))[0]
state.id = struct.unpack('q', bytes.fromhex("502368ee46d39313"))[0]

print(state.id)

""" with open('file_part.txt', 'r') as file:
  data = file.read()
  messageData = bytes.fromhex(data)
  #messageData = bytes.fromhex("146f8265b5342560290000000c000000ec77be7aaa40f90300000000")
  #print(data)
  
  encrypted = state.encrypt_message_data(messageData)

  file.close()
  with open('file_part_encrypted.txt', 'w') as file:
    file.write(encrypted.hex())
    file.close()
    #print(encrypted) """

with open('debugRequests_before.txt', 'r') as fileBefore:
  data = fileBefore.read()
  lines = data.splitlines()

  with open('debugRequests_after.txt', 'r') as fileAfter:
    data = fileAfter.read()
    linesAfter = data.splitlines()

    length = len(lines)
    for i in range(length):
      print("processing line %i, of %i", i, length)

      lineBefore = lines[i]

      messageData = bytes.fromhex(lineBefore)
      encrypted = state.encrypt_message_data(messageData) # need to comment padding inside

      lineAfter = linesAfter[i]
      
      #print(len(encrypted.hex()))
      #print(len(lineAfter))
      #print(encrypted.hex() == lineAfter)
      
      #break
      
      if encrypted.hex() != lineAfter:
        print("lol")

        with open('difference_before.txt', 'w') as file:
          file.write(lineAfter)
          file.close()
        
        with open('difference_after.txt', 'w') as file:
          file.write(encrypted.hex())
          file.close()

        
        #print(encrypted.hex())
        #print(lineAfter)
        exit()
