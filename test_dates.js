const targetDate = '2026-07-13';
const dateObj = new Date(targetDate);
dateObj.setHours(0,0,0,0);

const fy = { start_date: '2025-07-17', end_date: '2026-07-16' };
const sDate = new Date(fy.start_date);
const eDate = new Date(fy.end_date);
sDate.setHours(0,0,0,0);
eDate.setHours(23,59,59,999);

console.log('Target:', dateObj);
console.log('Start:', sDate);
console.log('End:', eDate);
console.log('Match:', dateObj >= sDate && dateObj <= eDate);
