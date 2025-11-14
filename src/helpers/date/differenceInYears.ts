export default function differenceInYears(earlierDate: Date, laterDate: Date) {
  const day1 = earlierDate.getDate();
  const day2 = laterDate.getDate();
  const month1 = earlierDate.getMonth();
  const month2 = laterDate.getMonth();
  const year1 = earlierDate.getFullYear();
  const year2 = laterDate.getFullYear();
  const diff = year2 - year1;

  if(month1 < month2 || (month1 === month2 && day1 <= day2)) {
    return diff;
  } else {
    return diff - 1;
  }
}
