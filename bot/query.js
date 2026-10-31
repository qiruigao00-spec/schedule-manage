const people=[{id:'shanli',name:'山梨'},{id:'muyang',name:'牧羊'},{id:'xiaoguai',name:'小拐'}]
function parse(text,now=new Date()) {
 if(/删除|修改|新增|取消|预订|预约|添加/.test(text))throw Error('目前仅支持查询，不会修改档期。')
 const dates=[...text.matchAll(/(?<!\d)(?:(\d{4})[年\-/])?(\d{1,2})[月\-/](\d{1,2})(?:日|号)?(?!\d)/g)]
 if(dates.length!==1||/今天|明天|后天|昨天|前天|周|星期|上午|下午|晚上/.test(text))throw Error('请提供一个具体日期，例如“山梨2026年11月7日有档期吗”或“11月7日谁有空”。')
 const [,y,m,d]=dates[0],year=Number(y||new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric'}).format(now)),month=Number(m),day=Number(d)
 const check=new Date(Date.UTC(year,month-1,day))
 if(year<1000||check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)throw Error('日期无效，请重新输入。')
 const matched=people.filter(p=>text.includes(p.name))
 if(!matched.length&&!/谁|哪些|全部|所有/.test(text))throw Error('请指定山梨、牧羊、小拐，或问“11月7日谁有档期”。')
 return {date:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,people:matched.length?matched:people}
}
function format(query,rows) {
 return query.date+'\n'+query.people.map(p=>{
 const records=rows.filter(r=>r.photographerId===p.id)
 if(!records.length)return `${p.name}：系统未记录安排，可进一步确认档期`
 return `${p.name}：当天已有安排`+records.map(r=>[r.projectName&&`项目：${r.projectName}`,r.location&&`地点：${r.location}`,r.notes&&`备注：${r.notes}`].filter(Boolean).map(s=>'  '+s).join('\n')).filter(Boolean).map(s=>'\n'+s).join('')
 }).join('\n')
}
module.exports={parse,format}
