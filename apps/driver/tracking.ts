import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import {PermissionsAndroid,Platform} from "react-native";
export const TASK="trackbus-driver-location-v3";
export const secure={keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY};
const SESSION="trackbus_session",ACTIVE="trackbus_active",PENDING="trackbus_latest",STATUS="trackbus_status";
type Session={origin:string;token:string;expires:number};
type Active={tripId:string;epoch:string};
export type Trip={id:string;name:string;status:string;trackingMode:string;stops:{id:string;name:string}[]};
export async function readSession():Promise<Session|null>{const raw=await SecureStore.getItemAsync(SESSION);return raw?JSON.parse(raw):null;}
export async function readActive():Promise<Active|null>{const raw=await SecureStore.getItemAsync(ACTIVE);return raw?JSON.parse(raw):null;}
export async function trackingStatus(){return await SecureStore.getItemAsync(STATUS)||"GPS desativado";}
async function status(message:string){await SecureStore.setItemAsync(STATUS,new Date().toLocaleTimeString("pt-BR")+" · "+message,secure);}
class ApiError extends Error{constructor(public status:number,message:string){super(message);}}
export async function request<T>(path:string,body?:unknown):Promise<T>{
 const session=await readSession();if(!session||session.expires<=Date.now())throw new ApiError(401,"Sessão expirada. Pareie novamente.");
 const r=await fetch(session.origin+"/api"+path,{method:body===undefined?"GET":"POST",headers:{Authorization:"Bearer "+session.token,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 if(!r.ok){const data=await r.json().catch(()=>({}));throw new ApiError(r.status,data.error||"API indisponível ("+r.status+")");}return r.json();
}
export async function pair(origin:string,code:string){
 const url=new URL(origin);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw Error("Informe a origem HTTPS da apresentação.");
 const r=await fetch(url.origin+"/api/driver/exchange",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:code.trim().toUpperCase()}),signal:AbortSignal.timeout(12000)});
 const data=await r.json().catch(()=>({}));if(!r.ok||!data.token)throw Error(data.error||"Pareamento recusado. Verifique o acesso do aparelho à API.");
 await SecureStore.setItemAsync(SESSION,JSON.stringify({origin:url.origin,token:data.token,expires:Date.now()+data.expiresIn*1000}),secure);
}
export async function stopTracking(reason="Compartilhamento encerrado"){
 await SecureStore.deleteItemAsync(ACTIVE);await SecureStore.deleteItemAsync(PENDING);
 if(await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);
 await status(reason);
}
export async function unpair(){
 await stopTracking();
 try{await request("/driver/revoke",{});}finally{await SecureStore.deleteItemAsync(SESSION);}
}
export async function startTracking(tripId:string){
 const list=await request<Trip[]>("/driver/trips");if(!list.some(t=>t.id===tripId&&t.status==="in_progress"&&t.trackingMode!=="simulation"))throw Error("Inicie uma viagem atribuída com GPS real.");
 if(!await Location.hasServicesEnabledAsync())throw Error("Ative a localização do aparelho.");
 const fg=await Location.requestForegroundPermissionsAsync();if(!fg.granted)throw Error("Permissão de localização negada.");
 const bg=await Location.requestBackgroundPermissionsAsync();if(!bg.granted)throw Error("Permita localização em segundo plano nas configurações.");
 if(Platform.OS==="android"&&Number(Platform.Version)>=33)await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
 await stopTracking();await SecureStore.setItemAsync(ACTIVE,JSON.stringify({tripId,epoch:String(Date.now())}),secure);
 try{await Location.startLocationUpdatesAsync(TASK,{accuracy:Location.Accuracy.High,timeInterval:5000,distanceInterval:4,showsBackgroundLocationIndicator:true,pausesUpdatesAutomatically:false,activityType:Location.ActivityType.AutomotiveNavigation,foregroundService:{notificationTitle:"TrackBus Driver · GPS ativo",notificationBody:"Compartilhando posição com a viagem atribuída.",notificationColor:"#FACC15",killServiceOnDestroy:true}});await status("GPS ativo · aguardando sensor");}
 catch(error){await stopTracking("Falha ao ativar GPS");throw error;}
}
let queue:Promise<void>=Promise.resolve();
async function transmit(locations:Location.LocationObject[]){
 const active=await readActive();if(!active)return;
 const newest=locations.filter(p=>p.coords.accuracy!==null&&p.coords.accuracy<=100&&Math.abs(Date.now()-p.timestamp)<60000).sort((a,b)=>b.timestamp-a.timestamp)[0];
 if(newest){const c=newest.coords;await SecureStore.setItemAsync(PENDING,JSON.stringify({epoch:active.epoch,p:{lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,timestamp:Math.round(newest.timestamp),speed:c.speed!==null&&c.speed>=0?c.speed:null,heading:c.heading!==null&&c.heading>=0?c.heading:null,source:"gps"}}),secure);}
 const raw=await SecureStore.getItemAsync(PENDING);if(!raw)return;
 const item=JSON.parse(raw);if(item.epoch!==active.epoch||Date.now()-item.p.timestamp>60000){await SecureStore.deleteItemAsync(PENDING);return;}
 if((await readActive())?.epoch!==active.epoch)return;
 try{await request("/trips/"+encodeURIComponent(active.tripId)+"/location",item.p);await SecureStore.deleteItemAsync(PENDING);await status("Posição GPS sincronizada");}
 catch(e){if(e instanceof ApiError && [401,403,404,409].includes(e.status)){await stopTracking(e.message);return;}if(e instanceof ApiError&&e.status===422)await SecureStore.deleteItemAsync(PENDING);await status(e instanceof ApiError?e.message:"Sem conexão · última posição protegida para reenvio");}
}
export function retryLatest(){queue=queue.catch(()=>{}).then(()=>transmit([]));return queue;}
TaskManager.defineTask<{locations:Location.LocationObject[]}>(TASK,async({data,error})=>{
 if(error){await status("Sensor indisponível: "+error.message);return;}
 if(data?.locations){queue=queue.catch(()=>{}).then(()=>transmit(data.locations));await queue;}
});

