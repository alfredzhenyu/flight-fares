// One projection for both the price list and calendar. Raw evidence stays intact.
(function(root){
  const key=r=>[r.origin,r.destination,r.departure_date,r.nights||0].join('|');
  const checkKey=c=>key({...c,departure_date:c.from});
  const recent=(at,now=Date.now())=>Number.isFinite(Date.parse(at))&&now-Date.parse(at)>=0&&now-Date.parse(at)<3600000;
  const current=(r,data,now=Date.now())=>Boolean(data.run&&r.observed_at>=data.run.started_at&&now-Date.parse(r.observed_at)<26*3600000);
  const byPrice=(a,b)=>a.price-b.price||a.departure_date.localeCompare(b.departure_date)||key(a).localeCompare(key(b));
  function cities(data){
    return new Map(Object.entries(data.countries).flatMap(([country,c])=>Object.entries(c.cities||{}).flatMap(([id,city])=>Object.keys(city.airports).map(a=>[a,country+':'+id]))));
  }
  function routeFares(data){
    const routes=new Map();
    for(const r of [...data.calendar,...data.quotes]){
      const k=key(r);if(!routes.has(k))routes.set(k,{calendar:null,quotes:[]});
      const group=routes.get(k);
      if(r.kind==='calendar'){if(!group.calendar||r.observed_at>group.calendar.observed_at)group.calendar=r;}
      else group.quotes.push(r);
    }
    return [...routes.values()].map(({calendar,quotes})=>{
      const best=quotes.sort(byPrice)[0];
      const r=!calendar||(best&&best.observed_at>=calendar.observed_at)?best:calendar;
      const detail=best&&best.price===r.price?best:null;
      return {...r,reference:calendar,detail};
    });
  }
  function minima(rows,data,{includeHistory=false,now=Date.now()}={}){
    const city=cities(data),groups=new Map();
    for(const row of rows){
      if(!includeHistory&&!current(row,data,now))continue;
      const k=[city.get(row.destination)||row.destination,row.departure_date,row.nights||0].join('|');
      const previous=groups.get(k);
      if(!previous||Number(current(row,data,now))>Number(current(previous,data,now))||
        (current(row,data,now)===current(previous,data,now)&&byPrice(row,previous)<0))groups.set(k,row);
    }
    return [...groups.values()].sort(byPrice);
  }
  function calendarRows(rows,data,now=Date.now()){
    const best=new Map();
    for(const row of rows){
      const old=best.get(row.departure_date);
      if(!old||byPrice(row,old)<0)best.set(row.departure_date,row);
    }
    return best;
  }
  function details(row,data){return data.quotes.filter(q=>key(q)===key(row)).sort(byPrice);}
  function lastCheck(row,data){return (data.detail_checks||data.run?.checks||[]).filter(c=>c.kind==='flight'&&checkKey(c)===key(row)).sort((a,b)=>(b.at||'').localeCompare(a.at||''))[0];}
  function needsQuery(row,data,now=Date.now()){
    const check=lastCheck(row,data);
    // Do not repeatedly auto-query a just-failed or valid empty search.
    if(check&&recent(check.at,now)&&['ok','empty','failed'].includes(check.status))return false;
    return !details(row,data).some(r=>recent(r.observed_at,now));
  }
  const api={key,checkKey,recent,current,byPrice,routeFares,minima,calendarRows,details,lastCheck,needsQuery};
  root.FareModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
