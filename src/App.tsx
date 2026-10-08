import{useEffect,useMemo,useRef,useState}from'react';
import type{ReactNode}from'react';
import{Apple,Box,ChevronRight,Edit3,Home,Minus,MoreHorizontal,MoveRight,PackagePlus,Plus,Search,Settings,Trash2,X}from'lucide-react';
import{supabase}from'./lib/supabase';

type Unit='unidades'|'pacotes'|'latas'|'garrafas'|'kg'|'g'|'L'|'ml';
type RecentFood={name:string;unit:Unit};
type Food={id:string;name:string;quantity:number;unit:Unit};
type Sub={id:string;name:string;foods:Food[]};
type Place={id:string;name:string;subdivisions:Sub[]};
type UndoState={label:string;action:()=>void};

const units:Unit[]=['unidades','pacotes','latas','garrafas','kg','g','L','ml'];
const recentFoodsKey='organizapp-recent-foods';
const uid=()=>crypto.randomUUID();
const authRedirectUrl=()=>new URL(import.meta.env.BASE_URL,window.location.origin).toString();
const searchKey=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const formatQuantity=(quantity:number,unit:Unit)=>unit==='unidades'?quantity+' '+(quantity===1?'unidade':'unidades'):quantity+' '+unit;
const makeSub=(name:string,foods:Food[]=[]):Sub=>({id:uid(),name,foods});
const initial:Place[]=[
  {id:uid(),name:'Geladeira',subdivisions:[makeSub('Prateleira de cima'),makeSub('Prateleira de baixo'),makeSub('Gaveta de legumes'),makeSub('Porta')]},
  {id:uid(),name:'Freezer',subdivisions:[makeSub('Gaveta de cima'),makeSub('Gaveta de baixo')]},
  {id:uid(),name:'Armário',subdivisions:[makeSub('Prateleira de cima'),makeSub('Prateleira de baixo')]},
  {id:uid(),name:'Gavetas',subdivisions:[makeSub('Gaveta de cima'),makeSub('Gaveta de baixo')]},
  {id:uid(),name:'Despensa',subdivisions:[makeSub('Prateleira de cima'),makeSub('Prateleira de baixo')]}
];

function normalize(raw:any):Place[]{
  if(!Array.isArray(raw))return initial;
  return raw.map((p:any)=>({
    id:isUUID(p.id)?p.id:uid(),
    name:String(p.name??'').trim(),
    subdivisions:(p.subdivisions?.length?p.subdivisions:[{id:uid(),name:'Geral',foods:p.foods||[]}]).map((s:any)=>({
      id:isUUID(s.id)?s.id:uid(),
      name:String(s.name??'Geral').trim(),
      foods:(s.foods||[]).map((f:any)=>({
        id:isUUID(f.id)?f.id:uid(),
        name:String(f.name??'').trim(),
        quantity:Math.max(0,Number.isFinite(Number(f.quantity))?Number(f.quantity):0),
        unit:units.includes(f.unit)?f.unit:'unidades'
      }))
    }))
  })).filter((p:Place)=>p.name||p.subdivisions.length);
}

function isUUID(v:any){return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)}
function readLocalPlaces(){
  try{return normalize(JSON.parse(localStorage.getItem('organizapp')||'null'))}catch{return initial}
}

async function uploadLocal(userId:string,places:Place[]){
  for(const p of places){
    const{error:placeError}=await supabase.from('locations').upsert({id:p.id,user_id:userId,name:p.name});
    if(placeError)throw placeError;
    for(const s of p.subdivisions){
      const{error:subError}=await supabase.from('subdivisions').upsert({id:s.id,user_id:userId,location_id:p.id,name:s.name});
      if(subError)throw subError;
      for(const f of s.foods){
        const{error:foodError}=await supabase.from('foods').upsert({id:f.id,user_id:userId,subdivision_id:s.id,name:f.name,quantity:f.quantity,unit:f.unit});
        if(foodError)throw foodError;
      }
    }
  }
}

function mapCloudPlaces(data:any[]):Place[]{
  return(data||[]).map((p:any)=>({
    id:isUUID(p.id)?p.id:uid(),
    name:String(p.name??'').trim(),
    subdivisions:(p.subdivisions||[]).filter(Boolean).map((s:any)=>({
      id:isUUID(s.id)?s.id:uid(),
      name:String(s.name??'Geral').trim(),
      foods:(s.foods||[]).filter(Boolean).map((f:any)=>({
        id:isUUID(f.id)?f.id:uid(),
        name:String(f.name??'').trim(),
        quantity:Math.max(0,Number.isFinite(Number(f.quantity))?Number(f.quantity):0),
        unit:units.includes(f.unit)?f.unit:'unidades'
      }))
    }))
  }));
}

function App(){
  const[places,setPlaces]=useState<Place[]>(readLocalPlaces);
  const[recentFoods,setRecentFoods]=useState<RecentFood[]>(()=>{try{const raw=JSON.parse(localStorage.getItem(recentFoodsKey)||'[]');return Array.isArray(raw)?raw.slice(0,8):[]}catch{return[]}});
  const[userId,setUserId]=useState<string|null>(null);
  const[user,setUser]=useState<any>(null);
  const[synced,setSynced]=useState(false);
  const[online,setOnline]=useState(()=>navigator.onLine);
  const[authBusy,setAuthBusy]=useState(false);
  const[authMessage,setAuthMessage]=useState<string|null>(null);
  const[authModal,setAuthModal]=useState(false);
  const[passwordRecovery,setPasswordRecovery]=useState(false);
  const[selected,setSelected]=useState<string|null>(null);
  const[selectedSub,setSelectedSub]=useState<string|null>(null);
  const[search,setSearch]=useState('');
  const[foodModal,setFoodModal]=useState<{place:string;sub:string;food?:Food}|null>(null);
  const[moveModal,setMoveModal]=useState<{place:string;sub:string;food:Food}|null>(null);
  const[foodMenu,setFoodMenu]=useState<string|null>(null);
  const[placeModal,setPlaceModal]=useState(false);
  const[placeToEdit,setPlaceToEdit]=useState<string|null>(null);
  const[subModal,setSubModal]=useState<{place:string;sub?:Sub}|null>(null);
  const[undo,setUndo]=useState<UndoState|null>(null);
  const undoTimer=useRef<number|null>(null);
  const authRequest=useRef(0);

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      const request=++authRequest.current;
      const{data:session}=await supabase.auth.getSession();
      const current=session.session?.user||null;
      const local=readLocalPlaces();
      if(!active||request!==authRequest.current)return;
      if(!current){
        setUser(null);
        setUserId(null);
        setSynced(false);
        setPlaces(local);
        return;
      }
      setUser(current);
      setUserId(current.id);
      const{data,error}=await supabase.from('locations').select('id,name,subdivisions(id,name,foods(id,name,quantity,unit))').order('created_at');
      if(!active||request!==authRequest.current)return;
      if(error){
        setAuthMessage('Não foi possível sincronizar agora. Seus dados locais continuam disponíveis.');
        setPlaces(local);
        return;
      }
      const cloudPlaces=mapCloudPlaces(data||[]);
      if(cloudPlaces.length===0&&local.length){
        try{
          await uploadLocal(current.id,local);
          if(active&&request===authRequest.current)setPlaces(local);
        }catch{
          if(active&&request===authRequest.current)setAuthMessage('Seus dados locais continuam disponíveis, mas não foi possível concluir a sincronização.');
        }
      }else if(active&&request===authRequest.current)setPlaces(cloudPlaces);
      if(active&&request===authRequest.current)setSynced(true);
    };
    load();
    const{data:listener}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED')++authRequest.current;
      if(event==='PASSWORD_RECOVERY'){
        setPasswordRecovery(true);
        setAuthMessage(null);
      }
      if(!session?.user){
        setUser(null);
        setUserId(null);
        setSynced(false);
        setPlaces(readLocalPlaces());
        return;
      }
      setUser(session.user);
      setUserId(session.user.id);
    });
    return()=>{active=false;listener.subscription.unsubscribe()};
  },[]);

  useEffect(()=>{localStorage.setItem('organizapp',JSON.stringify(places))},[places]);

  useEffect(()=>{
    const updateOnline=()=>setOnline(navigator.onLine);
    window.addEventListener('online',updateOnline);
    window.addEventListener('offline',updateOnline);
    return()=>{window.removeEventListener('online',updateOnline);window.removeEventListener('offline',updateOnline)};
  },[]);

  useEffect(()=>{
    if(!authMessage)return;
    const timer=window.setTimeout(()=>setAuthMessage(null),6000);
    return()=>window.clearTimeout(timer);
  },[authMessage]);

  async function refreshCloud(userIdToLoad=userId){
    if(!userIdToLoad)return;
    const{data,error}=await supabase.from('locations').select('id,name,subdivisions(id,name,foods(id,name,quantity,unit))').order('created_at');
    if(error){
      setSynced(false);
      return;
    }
    const cloudPlaces=mapCloudPlaces(data||[]);
    setPlaces(cloudPlaces);
    setSynced(true);
  }

  useEffect(()=>{
    if(!userId)return;
    const refresh=()=>{
      if(navigator.onLine)void refreshCloud(userId);
    };
    window.addEventListener('focus',refresh);
    window.addEventListener('online',refresh);
    return()=>{
      window.removeEventListener('focus',refresh);
      window.removeEventListener('online',refresh);
    };
  },[userId]);

  function rememberFood(name:string,unit:Unit){
    setRecentFoods(prev=>{
      const key=searchKey(name.trim());
      const next=[{name:name.trim(),unit},...prev.filter(f=>searchKey(f.name.trim())!==key)].slice(0,8);
      localStorage.setItem(recentFoodsKey,JSON.stringify(next));
      return next;
    });
  }

  useEffect(()=>{
    if(!foodMenu)return;
    const close=()=>setFoodMenu(null);
    document.addEventListener('click',close);
    return()=>document.removeEventListener('click',close);
  },[foodMenu]);

  useEffect(()=>()=>{if(undoTimer.current)window.clearTimeout(undoTimer.current)},[]);

  function offerUndo(label:string,action:()=>void){
    if(undoTimer.current)window.clearTimeout(undoTimer.current);
    setUndo({label,action});
    undoTimer.current=window.setTimeout(()=>setUndo(null),5000);
  }

  function consumeUndo(){
    if(!undo)return;
    undo.action();
    setUndo(null);
    if(undoTimer.current)window.clearTimeout(undoTimer.current);
  }

  function syncError(message='Não foi possível sincronizar esta alteração.'){
    setAuthMessage(message+' O dado local foi preservado.');
  }

  async function handleEmailAuth(mode:'signin'|'signup',email:string,password:string){
    setAuthBusy(true);
    setAuthMessage(null);
    const local=readLocalPlaces();
    try{
      if(mode==='signup'){
        const{data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:authRedirectUrl()}});
        if(error){setAuthMessage(error.message);return}
        if(data.user&&data.session&&local.length){
          try{await uploadLocal(data.user.id,local)}catch{setAuthMessage('Conta criada, mas não foi possível sincronizar os dados locais ainda.')}
        }
        if(data.session&&data.user){
          const request=++authRequest.current;
          const{data:cloudData,error:cloudError}=await supabase.from('locations').select('id,name,subdivisions(id,name,foods(id,name,quantity,unit))').order('created_at');
          if(request===authRequest.current&&cloudError){
            setSynced(false);
            setAuthMessage('Conta criada, mas não foi possível sincronizar agora. Seus dados locais continuam disponíveis.');
          }else if(request===authRequest.current){
            setPlaces(mapCloudPlaces(cloudData||[]));
            setSynced(true);
            setAuthMessage('Conta criada e dados sincronizados.');
          }
        }else{
          setAuthMessage('Conta criada. Verifique seu e-mail para confirmar a conta e depois entre novamente.');
        }
        if(data.session)setAuthModal(false);
      }else{
        const{data,error}=await supabase.auth.signInWithPassword({email,password});
        if(error){setAuthMessage(error.message);return}
        if(data.user&&local.length){
          const{data:cloud}=await supabase.from('locations').select('id').limit(1);
          if(!cloud?.length){
            try{await uploadLocal(data.user.id,local)}catch{setAuthMessage('Login realizado, mas não foi possível concluir a sincronização dos dados locais.')}
          }
        }
        const request=++authRequest.current;
        const{data:cloudData, error:cloudError}=await supabase.from('locations').select('id,name,subdivisions(id,name,foods(id,name,quantity,unit))').order('created_at');
        if(request===authRequest.current){
          if(cloudError){
            setSynced(false);
            setAuthMessage('Login realizado, mas não foi possível sincronizar agora. Seus dados locais continuam disponíveis.');
          }else{
            setPlaces(mapCloudPlaces(cloudData||[]));
            setSynced(true);
            setAuthMessage('Login realizado. Seus dados estão sincronizados.');
          }
        }
        setAuthModal(false);
      }
    }finally{setAuthBusy(false)}
  }

  async function resetPassword(email:string){
    setAuthBusy(true);
    setAuthMessage(null);
    try{
      const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl()});
      setAuthMessage(error?'Não foi possível enviar o link de recuperação.':'Enviamos um link de recuperação para seu e-mail.');
    }finally{setAuthBusy(false)}
  }

  async function signOut(){
    if(authBusy)return;
    setAuthBusy(true);
    ++authRequest.current;
    try{
      const{error}=await supabase.auth.signOut();
      if(error){setAuthMessage('Não foi possível sair da conta agora.');return}
      setUser(null);
      setUserId(null);
      setSynced(false);
      setAuthMessage(null);
    }finally{setAuthBusy(false)}
  }

  async function updatePassword(password:string){
    setAuthBusy(true);
    setAuthMessage(null);
    try{
      const{error}=await supabase.auth.updateUser({password});
      if(error){setAuthMessage(error.message);return}
      setPasswordRecovery(false);
      setAuthMessage('Senha atualizada com sucesso.');
    }finally{setAuthBusy(false)}
  }

  const current=places.find(p=>p.id===selected);
  const sub=current?.subdivisions.find(s=>s.id===selectedSub);
  const total=places.reduce((n,p)=>n+p.subdivisions.reduce((m,s)=>m+s.foods.length,0),0);
  const results=useMemo(()=>{
    const q=searchKey(search.trim());
    if(!q)return[];
    const found=places.flatMap(p=>p.subdivisions.flatMap(s=>s.foods.filter(f=>searchKey(f.name).includes(q)).map(f=>({...f,place:p.name,sub:s.name,placeId:p.id,subId:s.id}))));
    return found.sort((a,b)=>{
      const an=searchKey(a.name),bn=searchKey(b.name);
      const ar=an===q?0:an.startsWith(q)?1:2;
      const br=bn===q?0:bn.startsWith(q)?1:2;
      return ar-br||an.localeCompare(bn,'pt-BR');
    });
  },[search,places]);

  async function saveFood(placeId:string,subId:string,data:Omit<Food,'id'>,id?:string){
    const cleanName=data.name.trim();
    if(!cleanName||!places.some(p=>p.id===placeId&&p.subdivisions.some(s=>s.id===subId)))return;
    const safeQuantity=Math.max(0,Number.isFinite(data.quantity)?Number(data.quantity):0);
    const safeUnit=units.includes(data.unit)?data.unit:'unidades';
    const food={name:cleanName,quantity:safeQuantity,unit:safeUnit,id:id||uid()};
    const snapshot=places;
    const next=places.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id!==subId?s:{...s,foods:id?s.foods.map(f=>f.id===id?food:f):[...s.foods,food]})});
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('foods').upsert({id:food.id,user_id:userId,subdivision_id:subId,name:food.name,quantity:food.quantity,unit:food.unit});
      if(error){setPlaces(snapshot);syncError('Não foi possível salvar o alimento.');return}
    }
    rememberFood(food.name,food.unit);
    setFoodModal(null);
  }

  async function addToExistingFood(placeId:string,subId:string,existingId:string,amount:number,unit:Unit){
    const existing=places.find(p=>p.id===placeId)?.subdivisions.find(s=>s.id===subId)?.foods.find(f=>f.id===existingId);
    if(!existing||existing.unit!==unit||amount<=0)return;
    const nextQty=Number((existing.quantity+amount).toFixed(3));
    const snapshot=places;
    const next=places.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id!==subId?s:{...s,foods:s.foods.map(f=>f.id===existingId?{...f,quantity:nextQty}:f)})});
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('foods').update({quantity:nextQty}).eq('id',existingId);
      if(error){setPlaces(snapshot);syncError('Não foi possível somar a quantidade.');return}
    }
    setFoodModal(null);
    setAuthMessage(null);
  }

  async function removeFood(placeId:string,subId:string,id:string){
    const snapshot=places;
    const removed=places.find(p=>p.id===placeId)?.subdivisions.find(s=>s.id===subId)?.foods.find(f=>f.id===id);
    if(!removed)return;
    const next=places.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id!==subId?s:{...s,foods:s.foods.filter(f=>f.id!==id)})});
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('foods').delete().eq('id',id);
      if(error){setPlaces(snapshot);syncError('Não foi possível excluir o alimento.');return}
    }
    setFoodMenu(null);
    offerUndo('Alimento removido',()=>{
      setPlaces(ps=>ps.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id!==subId?s:{...s,foods:s.foods.some(f=>f.id===removed.id)?s.foods:[...s.foods,removed]})}));
      if(userId)supabase.from('foods').upsert({id:removed.id,user_id:userId,subdivision_id:subId,name:removed.name,quantity:removed.quantity,unit:removed.unit}).catch(()=>syncError('O alimento foi restaurado neste dispositivo, mas a sincronização falhou.'));
    });
  }

  const quantityStep=(unit:Unit)=>unit==='kg'||unit==='L'?0.1:1;

  async function changeQty(placeId:string,subId:string,id:string,delta:number){
    const food=places.find(p=>p.id===placeId)?.subdivisions.find(s=>s.id===subId)?.foods.find(f=>f.id===id);
    if(!food)return;
    const step=quantityStep(food.unit);
    const nextQty=Math.max(0,Number((food.quantity+(delta*step)).toFixed(3)));
    if(nextQty===food.quantity)return;
    const snapshot=places;
    const next=places.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id!==subId?s:{...s,foods:s.foods.map(f=>f.id===id?{...f,quantity:nextQty}:f)})});
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('foods').update({quantity:nextQty}).eq('id',id);
      if(error){setPlaces(snapshot);syncError('Não foi possível atualizar a quantidade.');}
    }
  }

  async function moveFood(fromPlaceId:string,fromSubId:string,foodId:string,toPlaceId:string,toSubId:string){
    if(fromSubId===toSubId)return;
    const sourcePlace=places.find(p=>p.id===fromPlaceId);
    const sourceSub=sourcePlace?.subdivisions.find(s=>s.id===fromSubId);
    const food=sourceSub?.foods.find(f=>f.id===foodId);
    if(!food)return;
    const snapshot=places;
    const next=places.map(p=>{
      if(p.id===fromPlaceId){
        return{...p,subdivisions:p.subdivisions.map(s=>s.id===fromSubId?{...s,foods:s.foods.filter(f=>f.id!==foodId)}:s)};
      }
      return p;
    }).map(p=>{
      if(p.id===toPlaceId){
        return{...p,subdivisions:p.subdivisions.map(s=>s.id===toSubId?{...s,foods:[...s.foods,food]}:s)};
      }
      return p;
    });
    setPlaces(next);
    setMoveModal(null);
    if(userId){
      const{error}=await supabase.from('foods').update({subdivision_id:toSubId}).eq('id',foodId);
      if(error){setPlaces(snapshot);syncError('Não foi possível mover o alimento.');return}
    }
    const destinationPlace=places.find(p=>p.id===toPlaceId);
    const destinationSub=destinationPlace?.subdivisions.find(s=>s.id===toSubId);
    offerUndo('Alimento movido',()=>{
      setPlaces(ps=>ps.map(p=>{
        if(p.id===toPlaceId)return{...p,subdivisions:p.subdivisions.map(s=>s.id===toSubId?{...s,foods:s.foods.filter(f=>f.id!==foodId)}:s)};
        if(p.id===fromPlaceId)return{...p,subdivisions:p.subdivisions.map(s=>s.id===fromSubId?{...s,foods:s.foods.some(f=>f.id===foodId)?s.foods:[...s.foods,food]}:s)};
        return p;
      }));
      if(userId)supabase.from('foods').update({subdivision_id:fromSubId}).eq('id',foodId).then(({error})=>{if(error)syncError('O alimento foi restaurado neste dispositivo, mas a sincronização falhou.')});
    });
    setFoodMenu(null);
    if(destinationPlace&&destinationSub)setAuthMessage(null);
  }

  async function savePlace(name:string,id?:string){
    const clean=name.trim();
    if(!clean)return;
    const duplicate=places.some(p=>p.id!==id&&searchKey(p.name)===searchKey(clean));
    if(duplicate){setAuthMessage('Já existe um local com esse nome.');return;}
    const placeId=id||uid();
    const newSub=id?null:makeSub('Geral');
    const snapshot=places;
    const next=id?places.map(p=>p.id===id?{...p,name:clean}:p):[...places,{id:placeId,name:clean,subdivisions:[newSub!]}];
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('locations').upsert({id:placeId,user_id:userId,name:clean});
      if(error){setPlaces(snapshot);syncError('Não foi possível salvar o local.');return}
      if(newSub){
        const{error:subError}=await supabase.from('subdivisions').upsert({id:newSub.id,user_id:userId,location_id:placeId,name:newSub.name});
        if(subError){
          await supabase.from('locations').delete().eq('id',placeId);
          setPlaces(snapshot);
          syncError('Não foi possível criar a subdivisão inicial.');
          return;
        }
      }
    }
    setPlaceModal(false);
    setPlaceToEdit(null);
  }

  async function removePlace(id:string){
    const removed=places.find(p=>p.id===id);
    if(!removed)return;
    const snapshot=places;
    const index=places.findIndex(p=>p.id===id);
    setPlaces(ps=>ps.filter(p=>p.id!==id));
    if(userId){
      const{error}=await supabase.from('locations').delete().eq('id',id);
      if(error){setPlaces(snapshot);syncError('Não foi possível excluir o local.');return}
    }
    if(selected===id){setSelected(null);setSelectedSub(null)}
    offerUndo('Local removido',()=>{
      setPlaces(ps=>{
        if(ps.some(p=>p.id===removed.id))return ps;
        const next=[...ps];
        next.splice(Math.min(index,next.length),0,removed);
        return next;
      });
      if(userId)uploadLocal(userId,[removed]).catch(()=>syncError('O local foi restaurado neste dispositivo, mas a sincronização falhou.'));
    });
  }

  async function saveSub(placeId:string,name:string,id?:string){
    const clean=name.trim();
    if(!clean)return;
    const place=places.find(p=>p.id===placeId);
    if(!place)return;
    const duplicate=place.subdivisions.some(s=>s.id!==id&&searchKey(s.name)===searchKey(clean));
    if(duplicate){setAuthMessage('Já existe uma divisão com esse nome neste local.');return;}
    const subId=id||uid();
    const snapshot=places;
    const next=id?places.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.map(s=>s.id===id?{...s,name:clean}:s)}):places.map(p=>p.id===placeId?{...p,subdivisions:[...p.subdivisions,{id:subId,name:clean,foods:[]}]}:p);
    setPlaces(next);
    if(userId){
      const{error}=await supabase.from('subdivisions').upsert({id:subId,user_id:userId,location_id:placeId,name:clean});
      if(error){setPlaces(snapshot);syncError('Não foi possível salvar a subdivisão.');return}
    }
    setSubModal(null);
  }

  async function removeSub(placeId:string,id:string){
    const removed=places.find(p=>p.id===placeId)?.subdivisions.find(s=>s.id===id);
    if(!removed)return;
    const snapshot=places;
    const index=places.find(p=>p.id===placeId)?.subdivisions.findIndex(s=>s.id===id)??-1;
    setPlaces(ps=>ps.map(p=>p.id!==placeId?p:{...p,subdivisions:p.subdivisions.filter(s=>s.id!==id)}));
    if(userId){
      const{error}=await supabase.from('subdivisions').delete().eq('id',id);
      if(error){setPlaces(snapshot);syncError('Não foi possível excluir a subdivisão.');return}
    }
    if(selectedSub===id)setSelectedSub(null);
    offerUndo('Divisão removida',()=>{
      setPlaces(ps=>ps.map(p=>{
        if(p.id!==placeId||p.subdivisions.some(s=>s.id===removed.id))return p;
        const next=[...p.subdivisions];
        next.splice(Math.min(Math.max(index,0),next.length),0,removed);
        return{...p,subdivisions:next};
      }));
      if(userId)supabase.from('subdivisions').upsert({id:removed.id,user_id:userId,location_id:placeId,name:removed.name}).catch(()=>syncError('A divisão foi restaurada neste dispositivo, mas a sincronização falhou.'));
    });
  }

  function openPlace(id:string){
    setSelected(id);
    const p=places.find(x=>x.id===id);
    setSelectedSub(p?.subdivisions[0]?.id||null);
  }

  function openSearchResult(placeId:string,subId:string){
    setSearch('');
    setSelected(placeId);
    setSelectedSub(subId);
  }

  function openAddFoodFromHome(){ if(!places.length){setPlaceToEdit(null);setPlaceModal(true);return;} setFoodModal({place:'',sub:''}); }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo"><Home size={20}/></div>
          <div><h1>OrganizaApp</h1><span>Sua casa, organizada.</span></div>
        </div>
        <div className="header-actions">
          <button className="sync-btn" onClick={user&&!user.is_anonymous?signOut:()=>setAuthModal(true)} disabled={authBusy}>
            <span className="auth-label">{user&&!user.is_anonymous?'Sair':(authBusy?'Aguarde...':'Criar conta / Entrar')}</span>
            <span className="auth-short">{user&&!user.is_anonymous?'Sair':'Entrar'}</span>
          </button>
          <button className="icon-btn" onClick={()=>{setPlaceToEdit(null);setPlaceModal(true)}} title="Gerenciar locais"><Settings size={20}/></button>
        </div>
      </header>

      <main>
        {authMessage&&<div className="auth-note" role="status" aria-live="polite">{authMessage}</div>}

        {selected?(
          <section>
            <button className="back" onClick={()=>{setSelected(null);setSelectedSub(null)}}>← Todos os locais</button>

            <div className="location-hero">
              <div className="location-identity">
                <div className="location-icon"><Box size={23}/></div>
                <div>
                  <p className="eyebrow">LOCAL</p>
                  <h2>{current?.name}</h2>
                  <p>
                    {current?.subdivisions.reduce((n,s)=>n+s.foods.length,0)||0}{' '}
                    {current?.subdivisions.reduce((n,s)=>n+s.foods.length,0)===1?'alimento':'alimentos'}{' '}
                    <span className="sync-status">{!online?'Sem internet · dados locais':synced?'Sincronizado':'Somente neste dispositivo'}</span>
                  </p>
                </div>
              </div>
              <button className="primary location-add" onClick={()=>selectedSub&&setFoodModal({place:selected,sub:selectedSub})} disabled={!selectedSub}>
                <Plus size={18}/> Adicionar alimento
              </button>
            </div>

            <div className="sub-head">
              <div>
                <h3>Divisões</h3>
                <p>Escolha onde quer guardar ou encontrar seus alimentos.</p>
              </div>
              <button onClick={()=>setSubModal({place:selected})}><Plus size={17}/> Nova divisão</button>
            </div>

            {current?.subdivisions.length?(
              <div className="sub-list">
                {current.subdivisions.map(s=>(
                  <div className={'sub-card '+(s.id===selectedSub?'active':'')} key={s.id}>
                    <button className="sub-select" aria-pressed={s.id===selectedSub} onClick={()=>setSelectedSub(s.id)}>
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.foods.length} {s.foods.length===1?'alimento':'alimentos'}</small>
                      </span>
                      <ChevronRight size={18}/>
                    </button>
                    <button className="sub-edit" title="Renomear divisão" aria-label={'Renomear '+s.name} onClick={()=>setSubModal({place:selected!,sub:s})}>
                      <Edit3 size={16}/>
                    </button>
                  </div>
                ))}
              </div>
            ):(
              <div className="no-subdivisions">
                <div className="no-subdivisions-icon"><Box size={20}/></div>
                <div><strong>Nenhuma divisão criada</strong><span>Crie a primeira para começar a guardar seus alimentos.</span></div>
                <button className="primary" onClick={()=>setSubModal({place:selected!})}><Plus size={17}/> Criar divisão</button>
              </div>
            )}

            {selectedSub&&sub?(
              <>
                <div className="selected-sub-head">
                  <div><span className="eyebrow">DIVISÃO</span><h3>{sub.name}</h3></div>
                  <span>{sub.foods.length} {sub.foods.length===1?'alimento':'alimentos'}</span>
                </div>

                {sub.foods.length?(
                  <div className="food-list">
                    {sub.foods.map(f=>(
                      <div className={'food '+(f.quantity===0?'out-of-stock':'')} key={f.id}>
                        <div className="food-icon"><Apple size={19}/></div>
                        <div className="food-name">
                          <strong>{f.name}</strong>
                          <span>{f.quantity===0?'Sem estoque · ':''}{f.unit}</span>
                        </div>
                        <div className="qty">
                          <button disabled={f.quantity===0} onClick={()=>changeQty(selected,selectedSub,f.id,-1)} aria-label={'Diminuir '+f.name}>
                            <Minus size={15}/>
                          </button>
                          <b>{f.quantity}</b>
                          {f.unit!=='unidades'&&<span className="qty-unit" aria-hidden="true">{f.unit}</span>}
                          <button onClick={()=>changeQty(selected,selectedSub,f.id,1)} aria-label={'Aumentar '+f.name}>
                            <Plus size={15}/>
                          </button>
                        </div>
                        <div className="food-actions">
                          <button className="small action-trigger" title="Mais ações" aria-label={'Mais ações para '+f.name} onClick={e=>{e.stopPropagation();setFoodMenu(foodMenu===f.id?null:f.id)}}>
                            <MoreHorizontal size={18}/>
                          </button>
                          {foodMenu===f.id&&(
                            <div className="action-menu" onClick={e=>e.stopPropagation()}>
                              <button onClick={()=>{setFoodModal({place:selected,sub:selectedSub,food:f});setFoodMenu(null)}}><Edit3 size={16}/> Editar</button>
                              <button onClick={()=>{setMoveModal({place:selected,sub:selectedSub,food:f});setFoodMenu(null)}}><MoveRight size={16}/> Mover para...</button>
                              <button className="danger" onClick={()=>removeFood(selected,selectedSub,f.id)}><Trash2 size={16}/> Excluir</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ):(
                  <Empty
                    title={'Nenhum alimento em '+sub.name}
                    text="Adicione os alimentos que ficam nesta subdivisão."
                    action={()=>setFoodModal({place:selected,sub:selectedSub})}
                  />
                )}
              </>
            ):null}
          </section>
        ):(
          <section>
            <div className="hero">
              <div className="hero-copy">
                <p className="eyebrow">SUA CASA</p>
                <h2>Encontre o que precisa.</h2>
                <p>Veja onde cada alimento está e mantenha sua casa organizada sem esforço.</p>
              </div>
            </div>

            <div className="home-tools">
              <div className="search">
                <Search size={19}/>
                <input aria-label="Buscar alimento" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Onde está o seu alimento?"/>
                {search&&<button onClick={()=>setSearch('')} aria-label="Limpar busca"><X size={17}/></button>}
              </div>
              {!search&&(
                <button className="home-add" onClick={openAddFoodFromHome}>
                  <span className="home-add-icon"><Plus size={20}/></span>
                  <span>
                    <strong>{places.length?'Adicionar alimento':'Criar primeiro local'}</strong>
                    <small>{places.length?'Registre algo novo na sua casa':'Escolha onde seus alimentos ficam'}</small>
                  </span>
                  <ChevronRight size={18}/>
                </button>
              )}
            </div>

            {search?(
              <>
                <div className="search-results-head">
                  <div>
                    <p className="eyebrow">RESULTADOS</p>
                    <h3>{results.length} {results.length===1?'alimento encontrado':'alimentos encontrados'}</h3>
                  </div>
                </div>

                {results.length?(
                  <div className="results">
                    {results.map(r=>(
                      <button className="result" key={r.id} onClick={()=>openSearchResult(r.placeId,r.subId)}>
                        <Apple size={18}/>
                        <span>
                          <strong>{r.name}</strong>
                          <small>{r.quantity===0?'Sem estoque':formatQuantity(r.quantity,r.unit)} · {r.place} · {r.sub}</small>
                        </span>
                        <ChevronRight size={17}/>
                      </button>
                    ))}
                  </div>
                ):(
                  <div className="search-empty">
                    <Search size={24}/>
                    <h3>Nenhum alimento encontrado</h3>
                    <p>Tente outro nome ou limpe a busca para ver seus locais.</p>
                    <button className="primary" onClick={()=>setSearch('')}>Ver meus locais</button>
                  </div>
                )}
              </>
            ):(
              <>
                <div className="section-title">
                  <div>
                    <h3>Seus locais</h3>
                    <p className="section-caption">{total} {total===1?'alimento':'alimentos'} em {places.length} {places.length===1?'local':'locais'}</p>
                  </div>
                  <button onClick={()=>{setPlaceToEdit(null);setPlaceModal(true)}}><Plus size={17}/> Novo local</button>
                </div>

                {places.length===0?(
                  <div className="no-places">
                    <div className="no-places-icon"><Box size={22}/></div>
                    <h3>Comece pelo primeiro local</h3>
                    <p>Crie uma geladeira, despensa ou outro lugar para começar a organizar seus alimentos.</p>
                    <button className="primary" onClick={()=>{setPlaceToEdit(null);setPlaceModal(true)}}><Plus size={18}/> Criar primeiro local</button>
                  </div>
                ):(
                  <div className="places">
                    {places.map(p=>(
                      <div
                        className="place-card"
                        key={p.id}
                        role="button"
                        aria-label={'Abrir '+p.name}
                        tabIndex={0}
                        onClick={()=>openPlace(p.id)}
                        onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPlace(p.id)}}}
                      >
                        <div className="place-top">
                          <div className="place-icon"><Box size={21}/></div>
                          <div className="place-card-actions">
                            <button className="card-edit" title="Renomear local" aria-label={'Renomear '+p.name} onClick={e=>{e.stopPropagation();setPlaceToEdit(p.id);setPlaceModal(true)}}>
                              <Edit3 size={16}/>
                            </button>
                            <div className="arrow">→</div>
                          </div>
                        </div>
                        <h3>{p.name}</h3>
                        <p>{p.subdivisions.length} {p.subdivisions.length===1?'divisão':'divisões'} · {p.subdivisions.reduce((n,s)=>n+s.foods.length,0)} {p.subdivisions.reduce((n,s)=>n+s.foods.length,0)===1?'alimento':'alimentos'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

      </main>

      {foodModal&&(
        <FoodModal
          data={foodModal.food}
          placeId={foodModal.place}
          subId={foodModal.sub}
          places={places}
          recentFoods={recentFoods}
          onClose={()=>setFoodModal(null)}
          onSave={(placeId,subId,d)=>saveFood(placeId,subId,d,foodModal.food?.id)}
          onAddToExisting={(placeId,subId,existingId,amount,unit)=>addToExistingFood(placeId,subId,existingId,amount,unit)}
        />
      )}
      {moveModal&&<MoveModal data={moveModal} places={places} onClose={()=>setMoveModal(null)} onMove={moveFood}/>}
      {placeModal&&<PlaceModal places={places} initialEditId={placeToEdit} onClose={()=>{setPlaceModal(false);setPlaceToEdit(null)}} onSave={savePlace} onDelete={async id=>{await removePlace(id);setPlaceModal(false);setPlaceToEdit(null)}}/>}
      {subModal&&<SubModal data={subModal.sub} onClose={()=>setSubModal(null)} onSave={n=>saveSub(subModal.place,n,subModal.sub?.id)} onDelete={id=>removeSub(subModal.place,id)}/>}
      {authModal&&<AuthModal busy={authBusy} onClose={()=>setAuthModal(false)} onSubmit={handleEmailAuth} onReset={resetPassword}/>}
      {passwordRecovery&&<PasswordRecoveryModal busy={authBusy} onClose={()=>setPasswordRecovery(false)} onSubmit={updatePassword}/>}
      {undo&&<div className="undo-toast" role="status" aria-live="polite"><span>{undo.label}</span><button onClick={consumeUndo}>Desfazer</button></div>}
    </div>
  );
}

function PasswordRecoveryModal({busy,onClose,onSubmit}:{busy:boolean;onClose:()=>void;onSubmit:(password:string)=>void}){
  const[password,setPassword]=useState('');
  const[confirm,setConfirm]=useState('');
  const canSave=password.length>=6&&password===confirm;
  return <Modal title="Criar nova senha" onClose={onClose}>
    <p className="modal-help">Escolha uma nova senha para continuar usando sua conta.</p>
    <label>Nova senha<input type="password" autoFocus value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete="new-password"/></label>
    <label>Confirmar senha<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Digite a senha novamente" autoComplete="new-password"/></label>
    {confirm&&password!==confirm&&<p className="password-mismatch">As senhas não coincidem.</p>}
    <button className="primary full" disabled={busy||!canSave} onClick={()=>onSubmit(password)}>{busy?'Aguarde...':'Salvar nova senha'}</button>
  </Modal>
}

function AuthModal({busy,onClose,onSubmit,onReset}:{busy:boolean;onClose:()=>void;onSubmit:(mode:'signin'|'signup',email:string,password:string)=>void;onReset:(email:string)=>void}){
  const[mode,setMode]=useState<'signin'|'signup'>('signin');
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  return <Modal title={mode==='signin'?'Entrar no OrganizaApp':'Criar sua conta'} onClose={onClose}>
    <p className="modal-help">{mode==='signin'?'Entre para acessar seus alimentos em qualquer dispositivo.':'Crie uma conta para manter seu histórico sincronizado no celular, PC e outros navegadores.'}</p>
    <label>E-mail<input type="email" autoFocus value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email"/></label>
    <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={mode==='signin'?'current-password':'new-password'}/></label>
    <button className="primary full" disabled={busy||!email.trim()||password.length<6} onClick={()=>onSubmit(mode,email.trim(),password)}>{busy?'Aguarde...':mode==='signin'?'Entrar':'Criar conta'}</button>
    {mode==='signin'&&<button className="auth-link" disabled={busy||!email.trim()} onClick={()=>onReset(email.trim())}>Esqueci minha senha</button>}
    <button className="auth-switch" onClick={()=>setMode(mode==='signin'?'signup':'signin')}>{mode==='signin'?'Ainda não tenho uma conta':'Já tenho uma conta'}</button>
  </Modal>
}

function Empty({title,text,action}:{title:string;text:string;action?:()=>void}){
  return <div className="empty"><PackagePlus size={30}/><h3>{title}</h3><p>{text}</p>{action&&<button className="primary" onClick={action}><Plus size={18}/> Adicionar alimento</button>}</div>
}

function FoodModal({data,placeId,subId,places,recentFoods,onClose,onSave,onAddToExisting}:{data?:Food;placeId:string;subId:string;places:Place[];recentFoods:RecentFood[];onClose:()=>void;onSave:(placeId:string,subId:string,d:Omit<Food,'id'>)=>void;onAddToExisting:(placeId:string,subId:string,existingId:string,amount:number,unit:Unit)=>void}){
  const[name,setName]=useState(data?.name||'');
  const[quantity,setQuantity]=useState(data?.quantity ?? 1);
  const[unit,setUnit]=useState<Unit>(data?.unit||'unidades');
  const[chosenPlace,setChosenPlace]=useState(placeId);
  const[chosenSub,setChosenSub]=useState(subId);
  const currentPlace=places.find(p=>p.id===chosenPlace);
  const existingFoods=currentPlace?.subdivisions.find(s=>s.id===chosenSub)?.foods||[];
  const duplicateFood=existingFoods.find(f=>f.id!==data?.id&&searchKey(f.name.trim())===searchKey(name.trim()));
  const duplicate=!!duplicateFood;
  const quantityStep=unit==='kg'||unit==='L'?0.1:1;
  const canSave=!!name.trim()&&!!chosenPlace&&!!chosenSub&&Number.isFinite(quantity)&&quantity>=0;
  const canMerge=!!duplicateFood&&duplicateFood.unit===unit&&quantity>0;
  return <Modal title={data?'Editar alimento':'Novo alimento'} onClose={onClose}>
    {!data&&<div className="destination-fields">
      <div className="destination-title"><span>Onde ele fica?</span><small>Escolha o local e a subdivisão.</small></div>
      <div className="row">
        <label>Local<select value={chosenPlace} onChange={e=>{setChosenPlace(e.target.value);setChosenSub(places.find(p=>p.id===e.target.value)?.subdivisions[0]?.id||'')}}><option value="">Selecione...</option>{places.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Subdivisão<select value={chosenSub} disabled={!chosenPlace} onChange={e=>setChosenSub(e.target.value)}><option value="">Selecione...</option>{currentPlace?.subdivisions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
    </div>}
    <label>Nome do alimento<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Arroz"/></label>
    {!data&&recentFoods.length>0&&!name&&<div className="recent-foods"><span>Adicionados recentemente</span><div>{recentFoods.slice(0,6).map(f=><button key={f.name} onClick={()=>{setName(f.name);setUnit(f.unit)}}>{f.name}</button>)}</div></div>}
    {duplicate&&<div className="duplicate-note"><strong>“{duplicateFood?.name}” já está nesta divisão.</strong><span>Você pode somar a nova quantidade ao estoque existente.</span>{canMerge&&<button type="button" onClick={()=>onAddToExisting(chosenPlace,chosenSub,duplicateFood!.id,quantity,unit)}><Plus size={15}/> Somar {formatQuantity(quantity,unit)}</button>}{duplicateFood&&duplicateFood.unit!==unit&&<small>As unidades são diferentes ({duplicateFood.unit} e {unit}), então mantenha como itens separados.</small>}</div>}
    <div className="row">
      <label>Quantidade<div className="number"><button type="button" aria-label="Diminuir quantidade" onClick={()=>setQuantity(Math.max(0,Number((quantity-quantityStep).toFixed(3))))}><Minus/></button><input type="number" min="0" step={quantityStep} value={quantity} onChange={e=>{const value=Number(e.target.value);setQuantity(Number.isFinite(value)?Math.max(0,value):0)}} aria-label="Quantidade" /><button type="button" aria-label="Aumentar quantidade" onClick={()=>setQuantity(Number((quantity+quantityStep).toFixed(3)))}><Plus/></button></div></label>
      <label>Unidade<select value={unit} onChange={e=>setUnit(e.target.value as Unit)}>{units.map(u=><option key={u}>{u}</option>)}</select></label>
    </div>
    <button className="primary full" disabled={!canSave} onClick={()=>onSave(chosenPlace,chosenSub,{name:name.trim(),quantity,unit})}>{data?'Salvar alterações':'Adicionar alimento'}</button>
  </Modal>
}

function MoveModal({data,places,onClose,onMove}:{data:{place:string;sub:string;food:Food};places:Place[];onClose:()=>void;onMove:(fromPlaceId:string,fromSubId:string,foodId:string,toPlaceId:string,toSubId:string)=>void}){
  return <Modal title="Mover alimento" onClose={onClose}>
    <div className="move-current"><span>Movendo</span><strong>{data.food.name}</strong><small>{formatQuantity(data.food.quantity,data.food.unit)} · {places.find(p=>p.id===data.place)?.name} · {places.find(p=>p.id===data.place)?.subdivisions.find(s=>s.id===data.sub)?.name}</small></div>
    <p className="modal-help move-help">Escolha o novo destino.</p>
    <div className="move-list">
      {places.map(p=><div className="move-place" key={p.id}>
        <div className="move-place-head"><strong>{p.name}</strong><small>{p.subdivisions.length} {p.subdivisions.length===1?'subdivisão':'subdivisões'}</small></div>
        <div className="move-sub-list">
          {p.subdivisions.map(s=>{
            const same=s.id===data.sub;
            return <button key={s.id} className={same?'current':''} disabled={same} onClick={()=>onMove(data.place,data.sub,data.food.id,p.id,s.id)}>
              <span>{s.name}</span>{same?<small>Atual</small>:<ChevronRight size={16}/>}
            </button>
          })}
        </div>
      </div>)}
    </div>
  </Modal>
}

function PlaceModal({places,initialEditId,onClose,onSave,onDelete}:{places:Place[];initialEditId?:string|null;onClose:()=>void;onSave:(name:string,id?:string)=>void;onDelete:(id:string)=>void}){
  const initialEdit=places.find(p=>p.id===initialEditId)||null;
  const[name,setName]=useState(initialEdit?.name||'');
  const[edit,setEdit]=useState<Place|null>(initialEdit);
  const[adding,setAdding]=useState(!places.length&&!initialEdit);
  const startAdd=()=>{setEdit(null);setName('');setAdding(true)};
  const goBack=()=>{setEdit(null);setName('');setAdding(false)};
  const save=()=>{onSave(name,edit?.id);goBack()};
  return <Modal title={edit?'Editar local':adding?'Novo local':'Seus locais'} onClose={onClose}>
    {!edit&&!adding?(
      <>
        <p className="modal-help">Organize sua casa por locais como geladeira, freezer, despensa ou armário.</p>
        {places.length?(
          <div className="manage-list">
            {places.map(p=>(
              <div key={p.id}>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.subdivisions.length} {p.subdivisions.length===1?'divisão':'divisões'}</small>
                </span>
                <div>
                  <button onClick={()=>{setEdit(p);setName(p.name)}} title={'Renomear '+p.name} aria-label={'Renomear '+p.name}><Edit3 size={16}/></button>
                  <button className="danger" onClick={()=>onDelete(p.id)} title={'Excluir '+p.name} aria-label={'Excluir '+p.name}><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        ):(
          <div className="manage-empty">
            <div className="no-places-icon"><Box size={20}/></div>
            <strong>Nenhum local criado</strong>
            <span>Comece pelo lugar onde seus alimentos ficam.</span>
          </div>
        )}
        <button className="primary full" onClick={startAdd}><Plus size={18}/> Novo local</button>
      </>
    ):(
      <>
        {places.length>0&&<button className="back modal-back" onClick={goBack}>← Voltar aos locais</button>}
        <label>Nome do local<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Geladeira"/></label>
        <button className="primary full" disabled={!name.trim()} onClick={save}>{edit?'Salvar alterações':'Criar local'}</button>
      </>
    )}
  </Modal>
}
function SubModal({data,onClose,onSave,onDelete}:{data?:Sub;onClose:()=>void;onSave:(name:string)=>void;onDelete:(id:string)=>void}){
  const[name,setName]=useState(data?.name||'');
  return <Modal title={data?'Editar subdivisão':'Nova subdivisão'} onClose={onClose}>
    <p className="modal-help">{data?'Altere o nome desta divisão.':'Crie uma divisão como “Gaveta de cima”, “Porta” ou “Prateleira 2”.'}</p>
    <label>Nome<input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Gaveta de cima"/></label>
    <button className="primary full" disabled={!name.trim()} onClick={()=>onSave(name)}>{data?'Salvar alterações':'Criar subdivisão'}</button>
    {data&&data.foods.length===0&&<button className="text-danger" onClick={()=>{onDelete(data.id);onClose()}}><Trash2 size={15}/> Excluir subdivisão</button>}
  </Modal>
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};
    document.addEventListener('keydown',onKey);
    return()=>document.removeEventListener('keydown',onKey);
  },[onClose]);
  return <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Fechar"><X/></button></div>{children}</div></div>
}

export default App;