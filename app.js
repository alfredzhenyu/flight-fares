"use strict";
let data, view = "flights", page = 0;
const size = 15;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = value => "¥" + Number(value).toLocaleString("zh-CN", {maximumFractionDigits: 0});
const clock = value => new Date(value).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false});
const safeUrl = value => {try {const url = new URL(value); return url.protocol === "https:" ? url.href : "#";}catch{return "#";}};
function destinationCities(){
  return Object.entries(data.countries).flatMap(([country,c])=>Object.entries(c.cities||Object.fromEntries(Object.entries(c.airports).map(([code,name])=>[code,{name,airports:{[code]:name}}]))).map(([id,item])=>({...item,id:country+":"+id,country})));
}
function city(code) { return data.origins[code] || destinationCities().find(c=>Object.hasOwn(c.airports,code))?.name || code; }
function airport(code) { return Object.values(data.countries).map(c=>c.airports[code]).find(Boolean) || data.origins[code] || code; }
function regionId(city){return city.region?city.country+":"+city.region:"";}
function cityGroups(cities){
  const groups=new Map();
  for(const city of cities){
    const label=data.countries[city.country].name+(city.region?" · "+city.region:"");
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push(city);
  }
  return groups;
}
function routeMatches(row){
  const origin=$("origin").value,country=$("country").value,region=$("region").value,destination=$("destination").value;
  const selected=destinationCities().find(c=>Object.hasOwn(c.airports,row.destination));
  return (!origin||row.origin===origin)&&(!country||selected?.country===country)&&(!region||Boolean(selected&&regionId(selected)===region))&&(!destination||selected?.id===destination);
}
function current(row) {return FareModel.current(row,data);}
function dailyFares(){return FareModel.minima(filters(FareModel.routeFares(data)),data,{includeHistory:$("include-history").checked});}
function filters(rows) {
  return rows.filter(r=>routeMatches(r)&&(!$("month").value||r.departure_date.startsWith($("month").value))&&r.trip_type===$("trip").value);
}
function option(value,label) {const el=document.createElement("option");el.value=value;el.textContent=label;return el;}
function openHelp(){
  $("help").showModal();
  $("help").scrollTop=0;
}
// Help must remain available even when the quotation file cannot be loaded.
$("open-help").addEventListener("click",()=>openHelp());
$("retry-help").addEventListener("click",()=>openHelp());
$("close-help").addEventListener("click",()=>$("help").close());
function renderHelp(){
  const origins=Object.values(data.origins),countries=Object.values(data.countries);
  const destinations=countries.reduce((n,c)=>n+Object.keys(c.airports).length,0);
  const policy=data.collection_policy;
  $("help-scope").textContent=`出发城市：${origins.join("、")}。目前覆盖 ${countries.map(c=>c.name).join("、")}的 ${destinationCities().length} 个目的城市、${destinations} 个已选机场，共 ${origins.length*destinations} 条配置航线；每次采集从次日起查询未来 ${policy?.window_days||60} 天。只查询配置中明确选定的城市和机场，不会自动扫描整个国家。`;
  $("help-airports").innerHTML=[...cityGroups(destinationCities())].map(([label,cities])=>`<li><strong>${esc(label)}</strong>：${cities.map(city=>`${esc(city.name)}（${Object.keys(city.airports).join(" / ")}）`).join("、")}。</li>`).join("");
  if(policy){
    $("help-single-budget").textContent=`后台每天最多预先补全 ${policy.max_detail_queries} 组单程详情；这个上限不限制每日最低价的展示。`;
    $("help-nights").textContent=policy.round_trip_nights.join("／");
  }
}
function initialize() {
  renderHelp();
  for(const [code,name] of Object.entries(data.origins)) $("origin").append(option(code,name));
  for(const [code,country] of Object.entries(data.countries)) $("country").append(option(code,country.name));
  populateRegions();
  populateDestinations();
  const months=new Set();for(let d=new Date(data.window.from+"T12:00:00");d<=new Date(data.window.to+"T12:00:00");d.setDate(d.getDate()+1)) months.add(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));
  for(const m of months) $("month").append(option(m,m.replace("-"," 年 ")+" 月"));
  $("window-label").textContent=`${data.window.from} 至 ${data.window.to} · 1 位成人 · 经济舱 · 直飞`;
  const status={success:"本次查询完成",partial:"部分查询未完成",failed:"本次更新失败"};
  $("run-status").textContent=data.run ? status[data.run.status] || "试运行" : "尚未开始采集";
  $("last-updated").textContent=data.run ? `${clock(data.run.finished_at)} 更新 · 北京时间` : "尚无更新记录";
  if(!data.run || data.run.status!=="success" || Date.now()-new Date(data.run.finished_at)>26*3600000){
    $("notice").hidden=false;
    $("notice-actions").hidden=false;
    $("notice").textContent=!data.run?"尚无采集结果。":data.run.status==="failed"?"本次查询失败，保留的报价带有原查询时间。请查看更新记录。":Date.now()-new Date(data.run.finished_at)>26*3600000?"最新数据已超过 26 小时，当前全部为历史报价，请打开来源页面重新确认。":"部分航线未取得有效结果。保留的历史报价带有原查询时间；覆盖情况见更新记录。";
  }
  $("filters").addEventListener("change",event=>{if(event.target.id==="country")populateRegions();if(["country","region"].includes(event.target.id))populateDestinations();page=0;render();});
  $("filters").addEventListener("submit",e=>e.preventDefault());
  $("filters").addEventListener("reset",()=>setTimeout(()=>{populateRegions();populateDestinations();page=0;render();},0));
  $("sort").addEventListener("change",()=>{page=0;render();});
  document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{view=btn.dataset.view;render();}));
  $("close-dialog").addEventListener("click",()=>$("detail").close());
  $("detail").addEventListener("close",()=>{selectedFare=null;selectedTrip=null;});
  $("include-history").addEventListener("change",()=>{page=0;render();});
  $("show-status").disabled=false;
  $("show-status").addEventListener("click",()=>{view="status";render();$("view-status").scrollIntoView({behavior:"smooth",block:"start"});});
  $("show-empty-checks").addEventListener("change",renderStatus);
  renderCityCoverage();
  render();
  initializeApi();
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
function populateRegions(){
  const chosen=$("region").value,country=$("country").value;
  const regions=new Map(destinationCities().filter(c=>country&&c.region&&c.country===country).map(c=>[regionId(c),c.region]));
  $("region").replaceChildren(option("",!country?"先选择目的国家":regions.size?"全部省份／州":"暂无地区划分"));
  for(const [id,label] of regions)$("region").append(option(id,label));
  $("region").disabled=!regions.size;
  if(regions.has(chosen))$("region").value=chosen;
}
function populateDestinations(){
  const chosen=$("destination").value;$("destination").replaceChildren(option("","全部城市"));
  const cities=destinationCities().filter(c=>(!$("country").value||$("country").value===c.country)&&(!$("region").value||$("region").value===regionId(c)));
  for(const [label,items] of cityGroups(cities)){
    const group=document.createElement("optgroup");group.label=label;
    for(const c of items)group.append(option(c.id,c.name));
    $("destination").append(group);
  }
  if([...$("destination").options].some(o=>o.value===chosen))$("destination").value=chosen;
}
function render(){
  const flights=dailyFares(),calendar=flights,fresh=flights.filter(current);
  const low=flights[0];
  $("lowest").textContent=low?money(low.price):"暂无";
  $("lowest-route").textContent=low?`${city(low.origin)} → ${city(low.destination)} · ${low.departure_date}${low.return_date?" / "+low.return_date:""}${current(low)?"":" · 历史参考价"}`:"当前范围尚未取得每日最低价";
  $("quote-count").textContent=flights.length;
  $("date-count").textContent=flights.filter(r=>r.detail).length;
  $("coverage-caption").textContent=`${fresh.length} 条本轮价格 · ${flights.length-fresh.length} 条历史参考价`;
  for(const name of ["flights","calendar","status"]) $("view-"+name).hidden=view!==name;
  document.querySelectorAll("[data-view]").forEach(b=>{b.classList.toggle("active",b.dataset.view===view);b.setAttribute("aria-pressed",String(b.dataset.view===view));});
  $("sort-label").hidden=view!=="flights";
  if(view==="flights")renderFlights(flights);
  if(view==="calendar")renderCalendar(calendar);
  if(view==="status")renderStatus();
}
function renderFlights(rows){
  rows.sort((a,b)=>($("sort").value==="date"?a.departure_date.localeCompare(b.departure_date):$("sort").value==="updated"?b.observed_at.localeCompare(a.observed_at):a.price-b.price)||FareModel.byPrice(a,b));
  const pages=Math.ceil(rows.length/size);page=Math.max(0,Math.min(page,pages-1));
  $("result-count").textContent=`${rows.length} 条每日最低价 · 每个目的城市、日期及停留天数保留一条${rows.some(r=>!current(r))?" · 含历史参考价":""}`;
  $("empty").hidden=rows.length>0;
  $("fare-rows").innerHTML=rows.slice(page*size,(page+1)*size).map(r=>{
    const legs=r.detail?.itineraries?.[0],a=legs?.[0],b=legs?.at(-1);
    const flight=legs?`<strong>${esc(a.departure.slice(11,16))} — ${esc(b.arrival.slice(11,16))}</strong><small>${esc(legs.map(l=>l.flight_number).join(" / "))} · ${current(r.detail)?"本轮":"历史"}同价详情</small>`:'<strong>航班详情待查询</strong><small>点击详情按需补查</small>';
    return `<tr><td><strong>${esc(r.departure_date.slice(5))}</strong><small>${r.return_date?"返回 "+esc(r.return_date.slice(5)):"单程"}</small></td><td class="route"><strong>${esc(city(r.origin))}<span>→</span>${esc(city(r.destination))}</strong><small>${esc(r.origin)} — ${esc(r.destination)} · ${esc(airport(r.destination))} · 直飞${r.nights?" · 停留 "+r.nights+" 天":""}</small></td><td>${flight}</td><td><span class="price">${money(r.price)}</span><small>${r.kind==="calendar"?"日历参考价":"详情查询最低价"} · ${r.nights?"往返":"单程"}</small></td><td>${esc(r.source)}<small>${esc(clock(r.observed_at))}<span class="tag ${current(r)?"":"old"}">${current(r)?"本轮价格":"历史参考价"}</span></small></td><td><button class="fare-action" data-detail="${esc(r.id)}">查看详情 ↗</button></td></tr>`;
  }).join("");
  $("fare-rows").querySelectorAll("[data-detail]").forEach(btn=>btn.addEventListener("click",()=>showDetail(rows.find(r=>r.id===btn.dataset.detail))));
  $("pagination").innerHTML=pages>1?`<button id="prev" ${page===0?"disabled":""}>上一页</button><span>${page+1} / ${pages}</span><button id="next" ${page===pages-1?"disabled":""}>下一页</button>`:"";
  if(pages>1){$("prev").onclick=()=>{page--;render();};$("next").onclick=()=>{page++;render();};}
}
function renderCalendar(rows){
  const best=FareModel.calendarRows(rows,data);
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
  selectedFare=r;
  $("detail-title").textContent=`${city(r.origin)} → ${city(r.destination)} · ${r.departure_date}`;
  const history=r.history||[];
  $("detail-body").innerHTML=`<p class="detail-price">${money(r.price)}</p><p>${r.nights?"往返整程":"单程"} · ${r.kind==="calendar"?"日历参考价":"详情查询最低价"}${current(r)?"":" · 历史参考价"}<br>${esc(r.departure_date)} 出发${r.return_date?" / "+esc(r.return_date)+" 返回":""} · ${esc(r.origin)} → ${esc(r.destination)}<br>查询于 ${esc(clock(r.observed_at))}（北京时间）</p><p class="subtle">这是已取得结果中的最低价；出发城市查询不完整时，不代表四城均已比价。详情只补查此航线、日期和行程。</p><section id="fare-details"></section><p>${esc(r.taxes)}；行李、退改条件待确认。<br>来源：${esc(r.source)}；购买前需确认商家结算价。</p><a class="detail-link" href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer">打开来源，重新查价 ↗</a><h3>该记录的价格变化</h3>${history.length>1?`<table class="history-table"><thead><tr><th>查询时间</th><th>价格</th></tr></thead><tbody>${history.slice().reverse().map(h=>`<tr><td>${esc(clock(h.at))}</td><td>${money(h.price)}</td></tr>`).join("")}</tbody></table>`:'<p class="subtle">目前只有一次记录。</p>'}`;
  renderFareDetails();attachTripSearch(r);
  $("detail").showModal();
  if(apiBase()&&FareModel.needsQuery(r,data))requestFareDetails();
}
function requestFareDetails(){
  if(selectedFare)startFlightJob({mode:"details",origin:selectedFare.origin,destination:selectedFare.destination,departure:selectedFare.departure_date,nights:selectedFare.nights||0});
}
function renderFareDetails(){
  if(!selectedFare||!$("fare-details"))return;
  const rows=FareModel.details(selectedFare,data),best=rows[0],check=FareModel.lastCheck(selectedFare,data);
  const text=check?.status==="empty"?"最近一次查询没有符合条件的航班；原参考价不作为可购买报价。":check?.status==="failed"?"最近一次详情查询未成功，可以稍后重试。":best?`已存 ${rows.length} 条航班详情，最低 ${money(best.price)}，查询于 ${clock(best.observed_at)}。`:"尚未取得航班号和起降时刻，正在准备按需查询。";
  const difference=best&&best.price!==selectedFare.price?`<p class="notice">打开时的参考价为 ${money(selectedFare.price)}；详情最低价为 ${money(best.price)}。${best.observed_at>=selectedFare.observed_at?"列表与日历已按最新结果重新比较。":"这份航班详情早于参考价，将按需刷新。"}</p>`:"";
  $("fare-details").innerHTML=`<h3>航班详情</h3><p>${esc(text)}</p>${difference}<p id="fare-message" role="status"></p><button type="button" class="fare-action" id="query-fare" ${apiBase()?"":"disabled"}>${best?"刷新详情":"查询详情"}</button>${rows.map(q=>`<div class="leg"><strong>${money(q.price)} · ${current(q)?"搜索报价":"历史报价"}</strong><small> · ${esc(clock(q.observed_at))}</small>${q.itineraries.map((trip,i)=>`<p>${i?"回程":"去程"} · 机场当地时间<br>${trip.map(l=>`${esc(l.flight_number)} · ${esc(l.airline)}<br>${esc(l.origin)} ${esc(l.departure.replace("T"," "))} → ${esc(l.destination)} ${esc(l.arrival.replace("T"," "))}`).join("<br>")}</p>`).join("")}</div>`).join("")}`;
  $("query-fare").onclick=requestFareDetails;
}

function renderStatus(){
  $("source-status").innerHTML=`<div class="sources">${data.sources.map(s=>`<p><strong>${esc(s.name)}</strong> · ${esc(s.status)}<br><small>${esc(s.note)}</small></p>`).join("")}<p><small>价格日历扫描所有配置航线；每日仅对其中的低价候选查询航班详情。往返优先查询每个国家两条低价航线的 5 / 7 / 10 天方案。</small></p></div>`;
  const status={ok:"取得报价",empty:"查询正常 · 无符合条件报价",failed:"查询失败",skipped:"本次未查询"};
  // Keep the original index for targeted retry even when rows are hidden.
  const checks=(data.run?.checks||[]).map((check,index)=>({check,index})).filter(({check})=>routeMatches(check));
  const count=name=>checks.filter(({check})=>check.status===name).length;
  $("check-summary").textContent=`取得报价 ${count("ok")} 项 · 查询失败 ${count("failed")} 项 · 未查询 ${count("skipped")} 项 · 正常无报价 ${count("empty")} 项`;
  $("empty-check-count").textContent=`显示无报价记录（${count("empty")}）`;
  const shown=checks.filter(({check})=>check.status!=="empty"||$("show-empty-checks").checked);
  $("check-rows").innerHTML=shown.map(({check:c,index})=>`<tr><td>${esc(city(c.origin))} → ${esc(city(c.destination))}<small>${esc(c.origin)} — ${esc(c.destination)} · ${esc(airport(c.destination))}</small></td><td>${c.kind==="calendar"?"价格日历":"航班详情"}${c.nights?" · 往返 "+c.nights+" 天":" · 单程"}<small>${esc(c.from)}${c.to!==c.from?" 至 "+esc(c.to):""}</small></td><td><span class="check-state ${esc(c.status)}">${status[c.status]||esc(c.status)}</span>${c.message?`<small>${esc(c.message)}</small>`:""}</td><td>${["failed","skipped"].includes(c.status)?"—":c.rows}</td><td>${esc(clock(c.at))}</td><td>${retryControl(c,index)}</td></tr>`).join("");
  $("checks-empty").hidden=shown.length>0;
  $("checks-empty").textContent=checks.length?"当前范围的查询均正常但未返回报价；可勾选上方开关查看记录。":"当前筛选范围没有查询记录。";
  $("check-rows").querySelectorAll("[data-retry]").forEach(b=>b.onclick=()=>startFlightJob({mode:"retry",run_id:data.run.id,check_index:Number(b.dataset.retry)}));
}
fetch("data.json",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("数据读取失败");return r.json();}).then(result=>{data=result;if(data.schema_version!==1)throw new Error("数据版本不匹配");initialize();}).catch(()=>{$("run-status").textContent="未能读取报价";$("notice").hidden=false;$("notice-actions").hidden=false;$("notice").textContent="报价文件暂时不可用，请稍后刷新。当前未展示任何示例价格。";$("result-count").textContent="暂无数据";});


// On-demand controls are enabled only after a production HTTPS API is configured.
let apiSession=sessionStorage.getItem("flight-api-session")||"",activeFlightJob=null,selectedTrip=null,selectedFare=null,pendingFlightRequest=null;
const beijingDay=value=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
function apiBase(){try{const url=new URL(data.api_url);return url.protocol==="https:"?url.origin:"";}catch{return "";}}
function initializeApi(){
  if(!$("api-message")){
    const message=document.createElement("p");message.id="api-message";message.className="notice";message.hidden=true;message.setAttribute("role","status");$("notice-actions").after(message);
  }
  if(!apiBase())return;
  if(!$("api-login")){
    const dialog=document.createElement("dialog");dialog.id="api-login";dialog.setAttribute("aria-labelledby","api-login-title");
    dialog.innerHTML='<div class="dialog-heading"><h2 id="api-login-title">查询权限</h2><button type="button" id="api-login-close" aria-label="关闭查询权限">×</button></div><p>输入你的 flight-api 访问口令。验证后本标签页内有效 12 小时。</p><form id="api-login-form"><label>访问口令<input id="api-access-key" type="password" autocomplete="off" required></label><button type="submit" class="fare-action">验证</button></form><p id="api-login-message" role="status"></p>';
    document.body.append(dialog);dialog.addEventListener("cancel",()=>{pendingFlightRequest=null;});$("api-login-close").onclick=()=>{pendingFlightRequest=null;dialog.close();};
    $("api-login-form").onsubmit=async e=>{e.preventDefault();const key=$("api-access-key").value;$("api-access-key").value="";try{const result=await apiCall("/session",{access_key:key},false);apiSession=result.token;sessionStorage.setItem("flight-api-session",apiSession);dialog.close();const pending=pendingFlightRequest;pendingFlightRequest=null;apiMessage("权限已验证。");if(pending)await startFlightJob(pending);}catch(error){$("api-login-message").textContent=error.message;}};
  }
  const saved=sessionStorage.getItem("flight-api-job");if(saved&&!activeFlightJob){try{const pending=JSON.parse(saved);if(pending.api===apiBase())pollFlightJob(pending.id);}catch{sessionStorage.removeItem("flight-api-job");}}
}
function apiMessage(text){if(!$("api-message"))return;$("api-message").hidden=false;$("api-message").textContent=text;for(const id of ["trip-message","fare-message"]){const el=$(id);if(el)el.textContent=text;}if($("query-fare"))$("query-fare").disabled=Boolean(activeFlightJob);}
async function apiCall(path,body,auth=true){
  if(!apiBase())throw Error("按需查询服务尚未开通");
  const response=await fetch(apiBase()+path,{method:body?"POST":"GET",headers:{...(body?{"Content-Type":"application/json"}:{}),...(auth?{Authorization:"Bearer "+apiSession}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const payload=await response.json();if(!response.ok){if(response.status===401){apiSession="";sessionStorage.removeItem("flight-api-session");}throw Error(payload.error||"查询服务暂不可用");}return payload;
}
function retryControl(check,index){
  if(!["failed","skipped"].includes(check.status))return check.retried?'<small>已补查</small>':'—';
  const originalDay=data.run.id.slice(0,8),today=beijingDay(Date.now()).replaceAll("-","");
  if(originalDay!==today)return '<button class="fare-action" disabled>已过期</button><small>已过查询日，无法补采当日价格</small>';
  if(!apiBase())return '<button class="fare-action" disabled>重试</button><small>按需服务配置中</small>';
  return `<button class="fare-action" data-retry="${index}" ${activeFlightJob?"disabled":""}>${activeFlightJob?"任务进行中":"重试"}</button>`;
}
function attachTripSearch(row){
  selectedTrip={origin:row.origin,destination:row.destination,departure:row.departure_date};
  const section=document.createElement("section");section.className="trip-search";
  section.innerHTML=`<h3>按游玩天数比较往返</h3><p class="subtle">固定 ${esc(row.departure_date)} 出发，查询 ${esc(row.origin)} → ${esc(row.destination)}（${esc(airport(row.destination))}）的往返整程总价。去程航班可能变化；结果是所查候选中的最低价。</p><form id="trip-search-form"><label>停留天数<select id="trip-nights">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${i+1===(row.nights||7)?"selected":""}>${i+1} 天</option>`).join("")}</select></label><label>返回日期范围<select id="trip-flex"><option value="0">严格按所选天数</option><option value="1">前后各 1 天</option></select></label><button class="fare-action" type="submit" ${apiBase()?"":"disabled"}>查询所选天数</button></form><p id="trip-message" role="status">${apiBase()?"先展示已存报价；查询会启动云端任务，通常需等待几分钟。同条件成功结果缓存 1 小时。":"按需查询服务配置中；可以先切换天数查看已存报价。"}</p><div id="trip-results"></div>`;
  $("detail-body").append(section);
  $("trip-search-form").onsubmit=e=>{e.preventDefault();startFlightJob({mode:"search",...selectedTrip,nights:Number($("trip-nights").value),flex:Number($("trip-flex").value)});};
  $("trip-nights").onchange=renderTripResults;$("trip-flex").onchange=renderTripResults;renderTripResults();
}
function renderTripResults(result){
  if(!$("trip-results")||!selectedTrip)return;
  const n=Number($("trip-nights").value);
  if(n===1||n===30)$("trip-flex").value="0";
  const flex=Number($("trip-flex").value);
  const matches=r=>r.kind==="flight"&&r.origin===selectedTrip.origin&&r.destination===selectedTrip.destination&&r.departure_date===selectedTrip.departure;
  const rows=(result?.quotes||data.quotes).filter(matches);
  const items=[];
  for(let nights=n-flex;nights<=n+flex;nights++){
    const candidates=rows.filter(r=>r.nights===nights).sort((a,b)=>Number(current(b))-Number(current(a))||a.price-b.price),best=candidates[0];
    const check=result?.checks?.find(c=>c.origin===selectedTrip.origin&&c.destination===selectedTrip.destination&&c.from===selectedTrip.departure&&c.nights===nights);
    const text=best?`${money(best.price)} · 返回 ${best.return_date}`:check?.status==="empty"?"本次无符合条件报价":check&&["failed","skipped"].includes(check.status)?"本次未取得可靠结果":"尚无已存报价";
    items.push(`<div class="leg"><strong>${nights} 天 · ${esc(text)}</strong>${best?`<br><small>查询于 ${esc(clock(best.observed_at))} · ${current(best)?"搜索报价":"历史报价"}</small><br>${best.itineraries.map((trip,i)=>`${i?"回程":"去程"} ${trip.map(l=>`${esc(l.flight_number)} ${esc(l.departure.slice(11,16))}—${esc(l.arrival.slice(11,16))}`).join(" / ")}`).join("<br>")}<br><a href="${esc(safeUrl(best.source_url))}" target="_blank" rel="noopener noreferrer">打开来源确认 ↗</a>`:""}</div>`);
  }
  $("trip-results").innerHTML=items.join("");
}
async function startFlightJob(request){
  if(!apiSession){pendingFlightRequest=request;apiMessage("需要验证查询权限；验证后将自动继续补查。");$("api-login")?.showModal();return;}
  if(activeFlightJob){apiMessage("已有任务进行中，请等待完成。");return;}
  activeFlightJob="submitting";if(view==="status")renderStatus();apiMessage("正在提交查询…");
  try{const job=await apiCall("/jobs",request);sessionStorage.setItem("flight-api-job",JSON.stringify({api:apiBase(),id:job.id}));await pollFlightJob(job.id,job);}
  catch(error){activeFlightJob=null;apiMessage(error.message);if(!apiSession){pendingFlightRequest=request;$("api-login")?.showModal();}if(view==="status")renderStatus();}
}
async function pollFlightJob(id,initial){
  activeFlightJob=id;
  try{
    const job=initial||await apiCall("/jobs/"+id);
    if(["success","partial","failed","expired"].includes(job.status)){
      activeFlightJob=null;sessionStorage.removeItem("flight-api-job");
      if(job.result)applyFlightResult(job.result);
      renderFareDetails();
      apiMessage(job.status==="success"?(job.cached?"已加载 1 小时内的缓存报价。":"查询完成，列表已更新。"):(job.result?.message||job.message||"部分查询未取得结果；保留原报价与查询时间。"));
      if(job.result&&selectedTrip)renderTripResults(job.result);
      if(job.published===false)apiMessage("查询结果已展示，但云端保存或发布未完成，请稍后核对更新记录。");
      renderCityCoverage();render();return;
    }
    apiMessage(({dispatching:"正在核对任务提交状态",queued:"云端排队中",running:"正在查询航班详情",publishing:"正在保存并发布报价"})[job.status]+"，完成后自动更新。请勿重复提交。");
  }catch(error){apiMessage(error.message+"；稍后继续检查。");if(!apiSession){activeFlightJob=null;$("api-login")?.showModal();return;}}
  setTimeout(()=>pollFlightJob(id),15000);
}
function applyFlightResult(result){
  const checks=new Map((data.detail_checks||[]).map(c=>[FareModel.checkKey(c),c]));
  for(const c of result.checks||[])if(c.kind==="flight"&&c.status!=="skipped"){const old=checks.get(FareModel.checkKey(c));if(!old||(c.at||"")>=(old.at||""))checks.set(FareModel.checkKey(c),c);}
  data.detail_checks=[...checks.values()];
  for(const name of ["quotes","calendar"]){
    let rows=data[name];
    for(const check of result.checks||[])if(["ok","empty"].includes(check.status))rows=rows.filter(r=>!(r.kind===check.kind&&r.origin===check.origin&&r.destination===check.destination&&r.nights===check.nights&&r.departure_date>=check.from&&r.departure_date<=check.to&&r.observed_at<=(result.finished_at||"")));
    const merged=new Map(rows.map(r=>[r.id,r]));for(const r of result[name]||[]){const prior=merged.get(r.id);if(!prior||r.observed_at>=prior.observed_at)merged.set(r.id,r);}data[name]=[...merged.values()];
  }
  if(result.parent_run_id===data.run?.id&&Number.isInteger(result.check_index)&&result.checks?.length){
    data.run.checks[result.check_index]={...result.checks[0],retried:true};
    data.run.status=data.run.checks.some(c=>["failed","skipped"].includes(c.status))?"partial":"success";
    data.run.finished_at=result.finished_at||data.run.finished_at;
    $("run-status").textContent=data.run.status==="success"?"本次查询完成":"部分查询未完成";
    $("last-updated").textContent=`${clock(data.run.finished_at)} 更新 · 北京时间`;
    if(data.run.status==="success"){$("notice").hidden=true;$("notice-actions").hidden=true;}
  }
}
