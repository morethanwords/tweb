export default function toHHMMSS(str: string | number, leadZero = false) {
  const sec_num = parseInt(str + '', 10);
  const hours = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - (hours * 3600)) / 60);
  let seconds: any = sec_num - (hours * 3600) - (minutes * 60);

  if(hours) leadZero = true;
  if(minutes < 10) minutes = leadZero ? '0' + minutes : minutes;
  if(seconds < 10) seconds = '0' + seconds;
  return (hours ? /* ('0' + hours).slice(-2) */hours + ':' : '') + minutes + ':' + seconds;
}
