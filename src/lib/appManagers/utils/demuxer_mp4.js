export function bin2String22(array) {
  return String.fromCharCode.apply(String, array);
}

export function indexOfSubArray(buffer, subArray) {
  for(let i = 0; i <= buffer.length - subArray.length; i++) {
    let found = true;
    for(let j = 0; j < subArray.length; j++) {
      if(buffer[i + j] !== subArray[j]) {
        found = false;
        break;
      }
    }
    if(found) return i;
  }
  return -1; // Not found
}
