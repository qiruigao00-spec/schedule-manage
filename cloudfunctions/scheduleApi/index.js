const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const collection = db.collection('schedules')
const pad = n => String(n).padStart(2, '0')
const docId = (photographerId, date) => `schedule_${photographerId}_${date}`

async function ensureCollection() {
  try { await db.createCollection('schedules') } catch (error) { /* 已存在 */ }
}

const makeDates = (year, months) => Object.entries(months).flatMap(([month, days]) =>
  days.map(day => `${year}-${pad(month)}-${pad(day)}`)
)

function initialSchedules() {
  const shanli = [
    ...makeDates(2026, {
      1:[5,7,8,10,16,17,22,28,29,31], 2:[7,9,11,13,21,22,26], 3:[7,10,16,21,28],
      4:[12,25,26], 5:[2,3,4,5,6,11,15,16,17,20,24,27,30], 6:[1,11,13,26], 7:[18],
      9:[12,26,27,28], 10:[3,4,6,11,12,14,15,25], 11:[1,4,7,10,13,14,15,16,19,22,24,26,29],
      12:[6,12,17,20,24]
    }),
    ...makeDates(2027, { 1:[1,2,6,10,11,12,15,16,17,23,25], 2:[9,10], 3:[13] })
  ].map(date => ({ photographerId:'shanli', photographerName:'山梨', date }))

  const muyang = [
    ...makeDates(2026, { 9:[9,12,28,30], 10:[1,3,6,25], 11:[1,4,13,14,26], 12:[20,24] }),
    ...makeDates(2027, { 1:[23] })
  ].map(date => ({ photographerId:'muyang', photographerName:'牧羊', date }))

  const xiaoguaiRaw = {
    '2026-09-12':'26.9.12 鼓岭 2680', '2026-09-15':'26.9.15 福安 2680（玮玮',
    '2026-09-16':'26.9.16 周宁 2680', '2026-09-19':'26.9.19 马尾 2680（木木策划推荐-300',
    '2026-09-28':'26.9.28 福州 2000 山梨双机',
    '2026-10-01':'原图：16.10.1-10.2 闽侯—泉州 两天 5000（按上下文归为2026年）',
    '2026-10-02':'原图：16.10.1-10.2 闽侯—泉州 两天 5000（按上下文归为2026年）',
    '2026-10-03':'26.10.3 福州 2680', '2026-10-06':'26.10.6 周宁 2680',
    '2026-10-08':'26.10.8 周宁 2680', '2026-10-11':'26.10.11 永泰 2680',
    '2026-10-25':'26.10.25 长乐 2680+200', '2026-11-01':'26.11.1 福州 2680',
    '2026-11-02':'26.11.2 订婚 1280', '2026-11-04':'26.11.4 周宁 2680 潘宸',
    '2026-11-05':'26.11.5 福州 午宴 1580', '2026-11-07':'26.11.7 福州 山梨双机',
    '2026-11-10':'26.11.10 沙县 2680', '2026-11-13':'26.11.13 闽侯 2680',
    '2026-11-14':'26.11.14 霞浦 2680', '2026-11-19':'26.11.19 福安 2680（定金1500',
    '2026-11-22':'26.11.22 永泰 2680+300', '2026-11-24':'26.11.24 福州 2000 胶片',
    '2026-11-26':'26.11.26 2380 小个', '2026-12-12':'26.12.12 福州 2680',
    '2026-12-18':'26.12.18 闽侯 2680', '2026-12-29':'26.12.29 闽侯-罗源 2680',
    '2027-01-02':'27.1.2 福州 2680（木木-300', '2027-01-06':'27.1.6 连江 2000+150（山梨双机',
    '2027-01-11':'27.1.11 闽侯 2180 半天（双机', '2027-01-17':'27.1.17 周宁 2680+200',
    '2027-01-23':'27.1.23 霞浦 2680+200', '2027-01-24':'27.1.24 闽侯 2180 半天',
    '2027-01-26':'27.1.26 泉州', '2027-01-31':'27.1.31 周宁 2680+200（抽200',
    '2027-02-08':'27.2.8 周宁 2680+300', '2027-02-09':'27.2.9 周宁 2680',
    '2027-04-17':'27.4.17 长乐', '2028-01-18':'28.1.18 周宁 2680'
  }
  const xiaoguai = Object.entries(xiaoguaiRaw).map(([date, notes]) => ({ photographerId:'xiaoguai', photographerName:'小拐', date, notes }))
  return [...shanli, ...muyang, ...xiaoguai]
}

async function list(event) {
  const start = `${event.year}-${pad(event.month)}-01`
  const end = event.month === 12 ? `${Number(event.year) + 1}-01-01` : `${event.year}-${pad(Number(event.month) + 1)}-01`
  const result = await collection.where({ date: db.command.gte(start).and(db.command.lt(end)) }).orderBy('date', 'asc').limit(100).get()
  const total = await collection.count()
  return { ok:true, data:result.data, total:total.total }
}

async function get(event) {
  const result = await collection.doc(event.id).get()
  return { ok:true, data:result.data }
}

async function save(event) {
  const item = event.schedule || {}
  if (!item.photographerId || !item.photographerName || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) throw new Error('摄影师和拍摄日期不能为空')
  const newId = docId(item.photographerId, item.date)
  const now = db.serverDate()
  if (event.id && event.id === newId) {
    await collection.doc(newId).update({ data:{ ...item, updatedAt:now } })
    return { ok:true, id:newId }
  }
  const existing = await collection.where({ _id:newId }).count()
  if (existing.total) throw new Error(`${item.photographerName}在${item.date}已有档期`)
  await collection.add({ data:{ _id:newId, ...item, createdAt:now, updatedAt:now } })
  if (event.id) await collection.doc(event.id).remove()
  return { ok:true, id:newId }
}

async function seed(event) {
  const rows = initialSchedules()
  const cursor = Math.max(0, Number(event.cursor) || 0)
  const batch = rows.slice(cursor, cursor + 12)
  let inserted = 0
  let skipped = 0
  await Promise.all(batch.map(async row => {
    try {
      await collection.add({ data:{ _id:docId(row.photographerId, row.date), ...row, projectName:'', location:'', notes:row.notes || '', source:'initial-import', createdAt:db.serverDate(), updatedAt:db.serverDate() } })
      inserted += 1
    } catch (error) {
      if (/duplicate|exist|-502001/.test(error.errMsg || error.message || '')) skipped += 1
      else throw error
    }
  }))
  const nextCursor = cursor + batch.length
  return { ok:true, inserted, skipped, total:rows.length, nextCursor, done:nextCursor >= rows.length }
}

exports.main = async event => {
  try {
    await ensureCollection()
    if (event.action === 'list') return await list(event)
    if (event.action === 'get') return await get(event)
    if (event.action === 'save') return await save(event)
    if (event.action === 'delete') { await collection.doc(event.id).remove(); return { ok:true } }
    if (event.action === 'seed') return await seed(event)
    return { ok:false, message:'未知操作' }
  } catch (error) {
    console.error(error)
    return { ok:false, message:error.message || error.errMsg || '云函数执行失败' }
  }
}
