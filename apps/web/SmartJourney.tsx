"use client";
import {useEffect,useRef,useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {toast} from "sonner";
import {Bell,BusFront,Footprints,MapPin,Star,Navigation,LogOut} from "lucide-react";
import MapView from "./Map";
import type {journeyState} from "../api/journey";
import type {Point} from "../../packages/domain";
import {departure} from "../../packages/domain";
import {api} from "./http";
import {PushChoice} from "./PushChoice";
type Journey=Awaited<ReturnType<typeof journeyState>> & {pushKey?:string|null};
const clock=(n:number)=>new Date(n).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Bahia"});
const descriptions={scheduled:"Viagem programada",in_progress:"Ônibus a caminho",paused:"Viagem pausada",interrupted:"Viagem interrompida",completed:"Viagem concluída",cancelled:"Viagem cancelada"};
export function JoinJourney({onJoin}:{onJoin:()=>void}){
 const schools=useQuery({queryKey:["open-schools"],queryFn:()=>api<{id:string;name:string}[]>("/journey/schools")});
 const [name,setName]=useState(""),[school,setSchool]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 return <form className="journey-entry" onSubmit={async e=>{e.preventDefault();setError("");setBusy(true);try{await api("/journey/join",{name,schoolId:school||schools.data?.[0]?.id});onJoin();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
 <label>Como podemos te chamar?<input required minLength={2} maxLength={48} value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome ou apelido" autoComplete="off"/></label>
 <label>Escola demonstrativa<select required value={school||schools.data?.[0]?.id||""} onChange={e=>setSchool(e.target.value)}>{schools.data?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 {schools.isSuccess&&!schools.data.length&&<p>Nenhuma escola abriu a sala de apresentação. A gestão pode abri-la em Configurações.</p>}
 {schools.isError&&<p role="alert">Não foi possível consultar as escolas. <button type="button" onClick={()=>schools.refetch()}>Tentar novamente</button></p>}
 {error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy||!schools.data?.length}>{busy?"Entrando…":"Entrar no TrackBus"}</button>
 </form>;
}
type Walk={available:boolean;reason?:string;geometry?:[number,number][];seconds?:number;meters?:number;source?:string};
export function SmartJourney({visitor=false,onLeave}:{visitor?:boolean;onLeave?:()=>void}){
 const qc=useQueryClient(),query=useQuery({queryKey:["smart-journey"],queryFn:()=>api<Journey>("/journey/state"),refetchInterval:5000,retry:false});
 const [search,setSearch]=useState(""),[shift,setShift]=useState(""),[routeId,setRoute]=useState(""),[stopId,setStop]=useState(""),[favorite,setFavorite]=useState(false),[notify,setNotify]=useState(true),[busy,setBusy]=useState(false),[position,setPosition]=useState<Point|null>(null),[walk,setWalk]=useState<Walk|null>(null),[locating,setLocating]=useState(false),[now,setNow]=useState(Date.now()),[showAlerts,setShowAlerts]=useState(false);
 const picker=useRef<HTMLDetailsElement>(null);
 const lastAlert=useRef(""),generation=useRef(0),seen=useRef(new Set<string>()),d=query.data,selected=d?.preferences.find(p=>p.selected),storedRoute=d?.routes.find(r=>r.id===selected?.routeId);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{generation.current++;setWalk(null);setPosition(null);setLocating(false);setRoute(selected?.routeId||"");setStop(selected?.stopId||"");setFavorite(selected?.favorite||false);setNotify(selected?.notify??true);},[selected?.routeId,selected?.stopId,selected?.favorite,selected?.notify]);
 useEffect(()=>()=>{generation.current++;},[]);
 const visible=(d?.routes||[]).filter(r=>(!shift||r.shift===shift)&&r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),draft=d?.routes.find(r=>r.id===routeId),target=storedRoute?.stops.find(s=>s.id===selected?.stopId);
 const eta=d?.eta,remaining=(d?.trip?.waitUntil||0)-now,rec=departure(eta?.minMinutes??null,walk?.seconds??null,d?.margin);
 const recommendation=rec.status==="on_time"?"Você provavelmente consegue chegar a tempo.":rec.status==="leave_now"?(rec.minutes===0?"Hora recomendada de sair.":"Margem pequena para chegar à parada."):rec.status==="insufficient"?"O ônibus poderá chegar antes de você. Não corra nem tente alcançar o veículo em movimento.":"Estimativa de saída indisponível.";
 useEffect(()=>{if(!selected?.notify||!d?.trip)return;const approaching=eta?.available&&eta.minMinutes<=3;const message=rec.status==="leave_now"?"Hora recomendada de sair para a parada.":approaching?"O ônibus está se aproximando da parada.":"";const key=d.trip.id+selected.stopId+message;if(message&&!seen.current.has(key)){seen.current.add(key);toast.info(message);}},[rec.status,eta?.minMinutes,selected,d?.trip]);
 useEffect(()=>{const n=d?.notices[0];if(selected?.notify&&n&&lastAlert.current!==n.id){if(lastAlert.current)toast.info(n.message);lastAlert.current=n.id;}},[d?.notices,selected?.notify]);
 const retire=async()=>{await api("/journey/leave",{});qc.clear();onLeave?.();};
 if(!d)return <div className="panel journey-panel"><p>{query.error?query.error.message:"Carregando sua viagem…"}</p><button className="button secondary" onClick={()=>query.refetch()}>Atualizar</button>{visitor&&<button onClick={retire}>Sair da demonstração</button>}</div>;
 const choose=async()=>{setBusy(true);try{await api("/journey/select",{routeId,stopId,favorite,notify});await query.refetch();if(picker.current)picker.current.open=false;toast.success("Preferência salva");}catch(err){toast.error((err as Error).message);}finally{setBusy(false);}};
 function locate(){if(!navigator.geolocation){toast.error("GPS indisponível neste dispositivo");return;}setLocating(true);const request=++generation.current;navigator.geolocation.getCurrentPosition(async fix=>{if(request!==generation.current)return;const p={lat:fix.coords.latitude,lng:fix.coords.longitude};setPosition(p);try{const result=await api<Walk>("/journey/walk",p);if(request===generation.current)setWalk(result);}catch(err){if(request===generation.current)setWalk({available:false,reason:(err as Error).message});}finally{if(request===generation.current)setLocating(false);}},()=>{if(request===generation.current){setLocating(false);toast.error("Localização indisponível. Verifique a permissão do navegador.");}},{enableHighAccuracy:true,maximumAge:0,timeout:20000});}
 const fresh=d.position&&now-d.position.timestamp<=60000;
 return <section className="journey-shell">
 <header className="journey-header"><div><span className="eyebrow">TRACKBUS / SMART JOURNEY</span><h1>Sua viagem, {d.name}.</h1><p>{d.school} · {visitor?"Participante da demonstração":"Portal do aluno"}</p></div>{visitor&&<button className="button secondary" onClick={retire}><LogOut size={16}/> Sair</button>}</header>
 <details ref={picker} className="panel journey-panel" open={!selected||undefined}><summary><Navigation size={17}/> {selected?`Escolha de rota · ${storedRoute?.name||"Atualizar"}`:"Escolha sua rota e parada"}</summary>
 <div className="journey-fields"><label>Buscar rota<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome da rota"/></label><label>Turno<select value={shift} onChange={e=>setShift(e.target.value)}><option value="">Todos</option>{Array.from(new Set(d.routes.map(r=>r.shift))).map(s=><option key={s}>{s}</option>)}</select></label><label>Rota da escola<select value={routeId} onChange={e=>{const r=d.routes.find(r=>r.id===e.target.value),saved=d.preferences.find(p=>p.routeId===r?.id);setRoute(e.target.value);setStop(saved?.stopId||r?.stops[0]?.id||"");setFavorite(saved?.favorite||false);setNotify(saved?.notify??true);}}><option value="">Selecionar rota</option>{visible.map(r=><option value={r.id} key={r.id}>{r.name} · {r.shift}{d.preferences.some(p=>p.favorite&&p.routeId===r.id)?" ★":""}</option>)}</select></label><label>Parada de embarque<select value={stopId} onChange={e=>setStop(e.target.value)}><option value="">Selecionar parada</option>{draft?.stops.map((s,i)=><option value={s.id} key={s.id}>{i+1}. {s.name}</option>)}</select></label></div>
 {draft&&<p>{draft.description} · Horários: {d.trips.filter(t=>t.routeId===draft.id).slice(0,4).map(t=>clock(t.plannedStart)).join(" / ")||"Sem viagens programadas"}</p>}
 <div className="journey-actions"><label><input type="checkbox" checked={favorite} onChange={e=>setFavorite(e.target.checked)}/> <Star size={15}/> Favoritar rota e parada</label><label><input type="checkbox" checked={notify} onChange={e=>setNotify(e.target.checked)}/> <Bell size={15}/> Alertas nesta tela</label><button className="button primary" disabled={busy||!routeId||!stopId} onClick={choose}>Salvar escolha</button></div><small>A escolha serve para acompanhamento. A escola confirma a vaga e o embarque.</small></details>
 {selected&&storedRoute&&<><div className="journey-grid"><section className="panel journey-map"><MapView large routes={[d.trip?.snapshot||storedRoute]} positions={d.position&&d.trip?[{id:d.trip.id,label:d.trip.name,position:d.position}]:[]} walking={walk?.geometry} studentPosition={position} onNotices={()=>setShowAlerts(true)}/></section>
 <section className="panel journey-panel"><span className="eyebrow">{storedRoute.name}</span><h2>{d.trip?descriptions[d.trip.status]:"Aguardando viagem"}</h2><p><MapPin size={15}/> {target?.name}</p><div className="eta-big">{eta?.available?<><strong>{eta.minMinutes}–{eta.maxMinutes}</strong><span>minutos{eta.simulated?" · simulado":""}</span></>:<><strong>—</strong><span>{eta?.reason||"Previsão indisponível"}</span></>}</div>
 {eta?.available&&<p>{eta.meters} m restantes · previsão entre {clock(d.serverTime+eta.minMinutes*60000)} e {clock(d.serverTime+eta.maxMinutes*60000)}.</p>}
 <p><BusFront size={16}/> {d.position?(d.position.source==="simulation"?"SIMULAÇÃO — POSIÇÃO FICTÍCIA":"GPS do motorista")+" · "+clock(d.position.timestamp)+(fresh?" · atual":" · desatualizado"):"GPS indisponível"}</p>
 {remaining>0&&<p role="status">Espera autorizada · {Math.floor(remaining/60000)}:{String(Math.floor(remaining/1000)%60).padStart(2,"0")} restantes</p>}
 <button className="button primary" disabled={locating} onClick={locate}><Footprints size={17}/>{locating?"Consultando…":"Caminho até minha parada"}</button><small>Ao tocar, você autoriza usar sua posição para calcular esta caminhada. Ela não é gravada nem exibida ao motorista.</small>
 {walk&&<div className="walking-result">{walk.available?<><strong>{Math.ceil((walk.seconds||0)/60)} min a pé · {Math.round(walk.meters||0)} m</strong><p>{recommendation}</p><small>{walk.source==="osm-local"?"Rede local de Salvador · © OpenStreetMap contributors, ODbL":"Provedor institucional"}</small>{rec.minutes!==null&&rec.minutes>=0&&<p>Saia em até aproximadamente {rec.minutes} min, por volta de {clock(d.serverTime+rec.minutes*60000)} · margem de segurança {d.margin} min.</p>}</>:<p>{walk.reason}</p>}</div>}</section></div>
 <details id="journey-alerts" className="panel journey-panel" open={showAlerts||undefined} onToggle={e=>setShowAlerts(e.currentTarget.open)}><summary><Bell size={17}/> Avisos da rota ({d.notices.length})</summary><PushChoice publicKey={d.pushKey}/>{d.notices.length?d.notices.map(n=><p key={n.id}><strong>{clock(n.createdAt)}{n.simulated?" · SIMULADO":""}</strong> {n.message}</p>):<p>Nenhum aviso recebido.</p>}</details></>}
 </section>;
}

