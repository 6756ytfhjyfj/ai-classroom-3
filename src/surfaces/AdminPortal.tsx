import {useState,useEffect} from "react";
import type {PublicUser} from "../../shared/protocol";
import {api} from "../services/api";
import {Admin} from "../components/Admin";
import {AdminSetup} from "../components/AdminSetup";
import {Auth} from "../components/Auth";
import {Brand,Spinner} from "../components/ui";
export default function AdminPortal(){const [user,setUser]=useState<PublicUser|null>(null),[loading,setLoading]=useState(true);useEffect(()=>{document.title="ONclasstime · 管理控制台";api<{user:PublicUser}>("/auth/me").then(r=>{if(r.user.role==="ADMIN")setUser(r.user)}).catch(()=>{}).finally(()=>setLoading(false));const expired=()=>setUser(null);window.addEventListener("session-expired",expired);return()=>window.removeEventListener("session-expired",expired)},[]);if(location.pathname==="/setup"||location.pathname==="/admin/setup")return <AdminSetup/>;if(loading)return <div className="app-loading"><Brand/><Spinner/></div>;if(!user)return <Auth admin onLogin={setUser}/>;return <Admin user={user} onLogout={()=>{void api("/auth/logout",{method:"POST",body:"{}"}).finally(()=>setUser(null))}}/>}
