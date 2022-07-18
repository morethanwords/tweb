function cacheCallback<A, T>(callback: (str: A) => T) {
  const stringResults: any = {}, numberResults: any = {};
  return (value: A): T => {
    const key = '_' + value;
    return (typeof(value) === 'string' ? stringResults : numberResults)[key] ??= callback(value);
  };
}

export default cacheCallback;
