// One projection for both the price list and calendar. Raw evidence stays intact.
(function(root){
  const key=r=>[r.origin,r.destination,r.departure_date,r.nights||0,r.max_stops||0].join('|');
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
      return {...r,reference:calendar,detail,direct_candidates:quotes.filter(q=>q.stops===0&&q.observed_at>=r.observed_at)};
    });
  }
  function minima(rows,data,{includeHistory=false,now=Date.now(),maxStops=0}={}){
    const city=cities(data),groups=new Map();
    for(const row of rows){
      if((row.max_stops||0)>maxStops||(!includeHistory&&!current(row,data,now)))continue;
      const k=[city.get(row.destination)||row.destination,row.departure_date,row.nights||0].join('|');
      if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);
    }
    return [...groups.values()].map(items=>{
      const fresh=items.filter(r=>current(r,data,now)),pool=fresh.length?fresh:items;
      const directRoutes=new Map();
      for(const r of pool.flatMap(r=>[r,...(r.direct_candidates||[])]).filter(isDirect)){
        const k=[r.origin,r.destination].join('|'),old=directRoutes.get(k);
        if(!old||r.observed_at>old.observed_at||(r.observed_at===old.observed_at&&r.price<old.price))directRoutes.set(k,r);
      }
      const direct=[...directRoutes.values()].sort(byPrice)[0];
      const cheapest=[...pool.filter(r=>!isDirect(r)),...(direct?[direct]:[])].sort(byPrice)[0];
      const winner=direct&&direct.price<=cheapest.price?direct:cheapest;
      return {...winner,detail:winner.detail||(winner.kind==='flight'?winner:null),direct_price:direct?.price??null,direct_observed_at:direct?.observed_at??null,
        savings:!isDirect(winner)&&direct?direct.price-winner.price:null};
    }).sort(byPrice);
  }
  const isDirect=r=>r.stops===0||(r.max_stops||0)===0;
  function worthwhile(rows,baseline=null){
    const prices=rows.filter(isDirect).map(r=>r.price);
    if(baseline!=null)prices.push(baseline);
    const direct=prices.length?Math.min(...prices):null;
    return rows.filter(r=>isDirect(r)||direct===null||r.price<direct).sort(byPrice);
  }

  function calendarRows(rows,data,now=Date.now()){
    const best=new Map();
    for(const row of rows){
      const old=best.get(row.departure_date);
      if(!old||byPrice(row,old)<0)best.set(row.departure_date,row);
    }
    return best;
  }
  function details(row,data){return worthwhile(data.quotes.filter(q=>key(q)===key(row)),row.direct_price);}
  function lastCheck(row,data){return (data.detail_checks||data.run?.checks||[]).filter(c=>c.kind==='flight'&&checkKey(c)===key(row)).sort((a,b)=>(b.at||'').localeCompare(a.at||''))[0];}
  function needsQuery(row,data,now=Date.now()){
    const check=lastCheck(row,data);
    // Do not repeatedly auto-query a just-failed or valid empty search.
    if(check&&recent(check.at,now)&&['ok','empty','failed'].includes(check.status))return false;
    return !details(row,data).some(r=>recent(r.observed_at,now));
  }
  const api={isDirect,worthwhile,key,checkKey,recent,current,byPrice,routeFares,minima,calendarRows,details,lastCheck,needsQuery};
  root.FareModel=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
