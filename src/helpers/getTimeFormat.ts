export default function getTimeFormat(): 'h12' | 'h23' {
  // try {
  //   const resolvedOptions = Intl.DateTimeFormat(navigator.language,  {hour: 'numeric'}).resolvedOptions();
  //   if('hourCycle' in resolvedOptions) {
  //     return (resolvedOptions as any).hourCycle === 'h12' ? 'h12' : 'h23';
  //   } else {
  //     return resolvedOptions.hour12 ? 'h12' : 'h23';
  //   }
  // } catch(err) {
  return new Date().toLocaleString().match(/\s(AM|PM)/) ? 'h12' : 'h23';
  // }
}
