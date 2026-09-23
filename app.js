"use strict";
let data, view = "flights", page = 0;
const size = 15;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => "¥" + Number(value).toLocaleString("zh-CN", {maximumFractionDigits: 0});
const clock = value => new Date(value).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
const safeUrl = value => {try {const url = new URL(value); return url.protocol === "https:" ? url.href : "#";}catch{return "#";}};
function city(code) { return data.origins[code] || Object.values(data.countries).map(c=>c.airports[code]).find(Boolean) || code; }
function current(row) {return data.run && row.observed_at >= data.run.started_at && Date.now() - new Date(row.observed_at).getTime() < 26 * 3600000;}
function filters(rows) {
  const [origin,country,destination,month,trip] = ["origin","country","destination","month","trip"].map(id=>$(id).value);
  return rows.filter(r=>(!origin||r.origin===origin)&&(!destination||r.destination===destination)&&(!country||Object.hasOwn(data.countries[country].airports,r.destination))&&(!month||r.departure_date.startsWith(month))&&r.trip_type===trip);
}
function option(value,label) {const el=document.createElement("option");el.value=value;el.textContent=label;return el;}
function initialize() {
  for(const [code,name] of Object.entries(data.origins)) $("origin").append(option(code,name));
  for(const [code,country] of Object.entries(data.countries)) $("country").append(option(code,country.name));
  populateDestinations();
  const months=new Set();for(let d=new Date(data.window.from+"T12:00:00");d<=new Date(data.window.to+"T12:00:00");d.setDate(d.getDate()+1)) months.add(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));
  for(const m of months) $("month").append(option(m,m.replace("-"," 年 ")+" 月"));
  $("window-label").textContent=`${data.window.from} 至 ${data.window.to} · 1 位成人 · 经济舱 · 直飞`;
  const status={success:"本次查询完成",partial:"部分查询未完成",failed:"本次更新失败"};
  $("run-status").textContent=data.run ? status[data.run.status] || "试运行" : "尚未开始采集";
  $("last-updated").textContent=data.run ? `${clock(data.run.finished_at)} 更新 · 北京时间` : "尚无更新记录";
  if(!data.run || data.run.status!=="success" || Date.now()-new Date(data.run.finished_at)>26*3600000){
    $("notice").hidden=false;
    $("notice").textContent=!data.run?"尚无采集结果。":data.run.status==="failed"?"本次查询失败，保留的报价带有原查询时间。请查看更新记录。":Date.now()-new Date(data.run.finished_at)>26*3600000?"最新数据已超过 26 小时，当前全部为历史报价，请打开来源页面重新确认。":"部分航线未取得有效结果。保留的历史报价带有原查询时间；覆盖情况见更新记录。";
  }
  $("filters").addEventListener("change",event=>{if(event.target.id==="country")populateDestinations();page=0;render();});
  $("filters").addEventListener("submit",e=>e.preventDefault());
  $("filters").addEventListener("reset",()=>setTimeout(()=>{populateDestinations();page=0;render();},0));
  $("sort").addEventListener("change",()=>{page=0;render();});
  document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{view=btn.dataset.view;render();}));
  $("close-dialog").addEventListener("click",()=>$("detail").close());
  renderCityCoverage();
  render();
}
function renderCityCoverage(){
  const stale=data.run && Date.now()-new Date(data.run.finished_at)>26*3600000;
  $("city-status").innerHTML=Object.entries(data.origins).map(([code,name])=>{
    const checks=(data.run?.checks||[]).filter(c=>c.origin===code);
    const ok=checks.filter(c=>c.status==="ok").length;
    const empty=checks.filter(c=>c.status==="empty").length;
    const failed=checks.filter(c=>c.status==="failed").length;
    const skipped=checks.filter(c=>c.status==="skipped").length;
    const status=!checks.length?"未查询":ok?(failed||skipped?"部分取得报价":"已取得报价"):failed?"查询失败":skipped?"查询未完成":"本次无符合条件报价";
    const old=data.quotes.filter(r=>r.origin===code&&!current(r)).length;
    const fresh=data.quotes.filter(r=>r.origin===code&&current(r)).length;
    return `<div><strong>${esc(name)}</strong><span>${stale?"历史查询 · ":""}${status}</span><small>${ok+empty}/${checks.length} 项查询完成 · ${fresh} 条新航班报价${old?` · ${old} 条历史报价`:""}</small></div>`;
  }).join("");
}
function populateDestinations(){
  const chosen=$("destination").value;$("destination").replaceChildren(option("","全部机场"));
  for(const [code,country] of Object.entries(data.countries))if(!$("country").value||$("country").value===code)for(const [airport,name]of Object.entries(country.airports))$("destination").append(option(airport,`${name} ${airport}`));
  if([...$("destination").options].some(o=>o.value===chosen))$("destination").value=chosen;
}
function render(){
  const flights=filters(data.quotes), calendar=filters(data.calendar), fresh=flights.filter(current);
  const low=fresh.length?fresh.reduce((a,b)=>a.price<b.price?a:b):null;
  $("lowest").textContent=low?money(low.price):"暂无";
  $("lowest-route").textContent=low?`${city(low.origin)} → ${city(low.destination)} · ${low.departure_date}${low.return_date?" / "+low.return_date:""}`:"本次筛选暂无新查询的航班报价";
  $("quote-count").textContent=fresh.length;
  $("date-count").textContent=calendar.filter(current).length.toLocaleString("zh-CN");
  $("coverage-caption").textContent=$("trip").value==="round_trip"?"航线 × 出发日期 × 停留天数":"航线 × 出发日期";
  for(const name of ["flights","calendar","status"]) $("view-"+name).hidden=view!==name;
  document.querySelectorAll("[data-view]").forEach(b=>{b.classList.toggle("active",b.dataset.view===view);b.setAttribute("aria-pressed",String(b.dataset.view===view));});
  $("sort-label").hidden=view!=="flights";
  if(view==="flights")renderFlights(flights);
  if(view==="calendar")renderCalendar(calendar);
  if(view==="status")renderStatus();
}
function renderFlights(rows){
  rows.sort((a,b)=>Number(current(b))-Number(current(a)) || ($("sort").value==="date"?a.departure_date.localeCompare(b.departure_date):$("sort").value==="updated"?b.observed_at.localeCompare(a.observed_at):a.price-b.price));
  const pages=Math.ceil(rows.length/size);page=Math.max(0,Math.min(page,pages-1));
  $("result-count").textContent=`${rows.length} 条低价候选报价${rows.some(r=>!current(r))?" · 历史报价列在后面":""}`;
  $("empty").hidden=rows.length>0;
  $("fare-rows").innerHTML=rows.slice(page*size,(page+1)*size).map(r=>{
    const legs=r.itineraries[0],a=legs[0],b=legs.at(-1);
    const extra=Math.round((new Date(b.arrival.slice(0,10))-new Date(a.departure.slice(0,10)))/86400000);
    return `<tr><td><strong>${esc(r.departure_date.slice(5))}</strong><small>${r.return_date?"返回 "+esc(r.return_date.slice(5)):"单程"}</small></td><td class="route"><strong>${esc(city(r.origin))}<span>→</span>${esc(city(r.destination))}</strong><small>${esc(r.origin)} — ${esc(r.destination)} · 直飞${r.nights?" · 停留 "+r.nights+" 天":""}</small></td><td><strong>${esc(a.departure.slice(11,16))} — ${esc(b.arrival.slice(11,16))}${extra?" +"+extra:""}</strong><small>${esc(legs.map(l=>l.flight_number).join(" / "))} · ${esc(a.airline)}</small></td><td><span class="price">${money(r.price)}</span><small>${r.return_date?"往返总价":"单程"} · 行李待确认</small></td><td>${esc(r.source)}<small>${esc(clock(r.observed_at))}<span class="tag ${current(r)?"":"old"}">${current(r)?"搜索报价":"历史报价"}</span></small></td><td><button class="fare-action" data-detail="${esc(r.id)}">查看详情 ↗</button></td></tr>`;
  }).join("");
  $("fare-rows").querySelectorAll("[data-detail]").forEach(btn=>btn.addEventListener("click",()=>showDetail(rows.find(r=>r.id===btn.dataset.detail))));
  $("pagination").innerHTML=pages>1?`<button id="prev" ${page===0?"disabled":""}>上一页</button><span>${page+1} / ${pages}</span><button id="next" ${page===pages-1?"disabled":""}>下一页</button>`:"";
  if(pages>1){$("prev").onclick=()=>{page--;render();};$("next").onclick=()=>{page++;render();};}
}
function renderCalendar(rows){
  const best=new Map();for(const row of rows){const prev=best.get(row.departure_date);if(!prev||Number(current(row))>Number(current(prev))||(current(row)===current(prev)&&row.price<prev.price))best.set(row.departure_date,row);}
  const allMonths=[...$("month").options].map(o=>o.value).filter(Boolean).filter(m=>!$("month").value||$("month").value===m);
  const prices=[...best.values()].filter(current).map(r=>r.price).sort((a,b)=>a-b);const low=prices[Math.floor(prices.length*.25)]||0;
  $("calendar-months").innerHTML=allMonths.map(m=>{
    const [year,month]=m.split("-").map(Number),first=new Date(year,month-1,1),days=new Date(year,month,0).getDate(),offset=(first.getDay()+6)%7;
    let cells=[...Array(offset)].map(()=>'<div class="day spacer"></div>').join("");
    for(let d=1;d<=days;d++){const date=m+"-"+String(d).padStart(2,"0"),r=best.get(date);cells+=`<button class="day ${r&&current(r)&&r.price<=low?"cheap":""}" ${r?`data-date="${date}"`:"disabled"} aria-label="${date}${r?"，"+money(r.price)+"，"+esc(city(r.origin))+"至"+esc(city(r.destination)):"，未取得报价"}"><span>${d}</span><strong>${r?money(r.price):"—"}</strong>${r?`<small>${esc(city(r.origin))}→${esc(city(r.destination))}${current(r)?"":" · 历史"}</small>`:""}</button>`;}
    return `<section class="calendar-month"><h2>${year} 年 ${month} 月</h2><div class="calendar-grid">${["一","二","三","四","五","六","日"].map(d=>`<span class="day-name">周${d}</span>`).join("")}${cells}</div></section>`;
  }).join("");
  $("calendar-months").querySelectorAll("[data-date]").forEach(btn=>btn.onclick=()=>showDetail(best.get(btn.dataset.date)));
}
function showDetail(r){
  $("detail-title").textContent=`${city(r.origin)} → ${city(r.destination)}`;
  const history=r.history||[];
  $("detail-body").innerHTML=`<p class="detail-price">${money(r.price)}</p><p>${r.return_date?"往返总价":"单程"} · ${r.kind==="calendar"?"日历参考价":"具体航班搜索报价"}${current(r)?"":" · 历史记录"}<br>${esc(r.departure_date)}${r.return_date?" 出发 / "+esc(r.return_date)+" 返回":" 出发"}<br>查询于 ${esc(clock(r.observed_at))}（北京时间）</p>${(r.itineraries||[]).map((trip,i)=>`<h3>${i?"回程":"去程"} · 机场当地时间</h3>${trip.map(l=>`<div class="leg"><strong>${esc(l.flight_number)} · ${esc(l.airline)}</strong><br>${esc(l.origin)} ${esc(l.departure.replace("T"," "))}<br>${esc(l.destination)} ${esc(l.arrival.replace("T"," "))}</div>`).join("")}`).join("")}<p>${esc(r.taxes)}；手提及托运行李均待确认。<br>来源：${esc(r.source)}；商家结算价尚未核实。<br>不含前往出发机场的地面交通费。</p><a class="detail-link" href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer">打开来源，重新查价 ↗</a><h3>本系统记录的报价变化</h3>${history.length>1?`<p class="subtle">同一${r.kind==="calendar"?"航线、日期的最低参考价":"航班搜索报价"}；行李和套餐条件未逐次核实。</p><table class="history-table"><thead><tr><th>查询时间</th><th>价格</th></tr></thead><tbody>${history.slice().reverse().map(h=>`<tr><td>${esc(clock(h.at))}</td><td>${money(h.price)}</td></tr>`).join("")}</tbody></table>`:'<p class="subtle">目前只有一次记录，尚不能判断价格趋势或全年高低。</p>'}`;
  $("detail").showModal();
}
function renderStatus(){
  $("source-status").innerHTML=`<div class="sources">${data.sources.map(s=>`<p><strong>${esc(s.name)}</strong> · ${esc(s.status)}<br><small>${esc(s.note)}</small></p>`).join("")}<p><small>价格日历扫描所有配置航线；每日仅对其中的低价候选查询航班详情。往返优先查询每个国家两条低价航线的 5 / 7 / 10 天方案。</small></p></div>`;
  const status={ok:"完成",empty:"本次无报价",failed:"查询失败",skipped:"本次未查询"};
  $("check-rows").innerHTML=(data.run?.checks||[]).map(c=>`<tr><td>${esc(city(c.origin))} → ${esc(city(c.destination))}</td><td>${c.kind==="calendar"?"价格日历":"航班详情"}${c.nights?" · 往返 "+c.nights+" 天":" · 单程"}<small>${esc(c.from)}${c.to!==c.from?" 至 "+esc(c.to):""}</small></td><td>${status[c.status]||esc(c.status)}${c.message?`<small>${esc(c.message)}</small>`:""}</td><td>${c.rows}</td><td>${esc(clock(c.at))}</td></tr>`).join("");
}
fetch("data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("数据读取失败");return r.json();}).then(result=>{data=result;if(data.schema_version!==1)throw new Error("数据版本不匹配");initialize();}).catch(()=>{$("run-status").textContent="未能读取报价";$("notice").hidden=false;$("notice").textContent="报价文件暂时不可用，请稍后刷新。当前未展示任何示例价格。";$("result-count").textContent="暂无数据";});
