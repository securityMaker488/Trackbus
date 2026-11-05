import {useEffect,useState} from "react";
import {api} from "./http";
export function PushChoice({publicKey}:{publicKey?:string|null}){
 const [on,setOn]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.getRegistration().then(r=>r?.pushManager?.getSubscription()).then(s=>setOn(!!s)).catch(()=>{});},[]);
 const supported=!!publicKey&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
 async function toggle(){setBusy(true);try{const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(sub){await api("/journey/push",{endpoint:sub.endpoint,enabled:false});await sub.unsubscribe();setOn(false);setMessage("Push desativado.");return;}
 if(await Notification.requestPermission()!=="granted"){setMessage("Permissão não concedida. Seus avisos continuam disponíveis aqui.");return;}
 const key=Uint8Array.from(atob(publicKey!.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
 sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{await api("/journey/push",{endpoint:sub.endpoint,enabled:true});}catch(e){await sub.unsubscribe();throw e;}setOn(true);setMessage("Notificações deste navegador ativadas.");}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <div><button className="button secondary" disabled={!supported||busy} onClick={toggle}>{on?"Desativar notificações neste aparelho":"Ativar notificações neste aparelho"}</button><small>{message||(!supported?"Push indisponível neste ambiente. Os avisos da rota continuam nesta tela.":"Requer sua permissão. As mensagens da tela seguem disponíveis.")}</small></div>;
}

