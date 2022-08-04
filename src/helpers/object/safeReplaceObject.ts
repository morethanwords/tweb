export default function safeReplaceObject(wasObject: any, newObject: any) {
  if(!wasObject) {
    return newObject;
  }

  for(var key in wasObject) {
    if(!newObject.hasOwnProperty(key)) {
      delete wasObject[key];
    }
  }

  for(var key in newObject) {
    // if (newObject.hasOwnProperty(key)) { // useless
    wasObject[key] = newObject[key];
    // }
  }

  return wasObject;
}
