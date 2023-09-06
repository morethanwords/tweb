export default function toHHMMSS(str: string | number, leadZero = false) {
  const sec_num = parseInt(str + '', 10);
  let hours: any = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - (hours * 3600)) / 60);
  let seconds: any = sec_num - (hours * 3600) - (minutes * 60);

  if(hours && hours < 10 && leadZero) hours = '0' + hours;
  if(minutes < 10 && (hours || leadZero)) minutes ='0' + minutes;
  if(seconds < 10) seconds = '0' + seconds;
  return (hours ? hours + ':' : '') + minutes + ':' + seconds;
}
