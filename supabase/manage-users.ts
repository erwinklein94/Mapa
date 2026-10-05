import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
Deno.serve(async req=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Método não permitido'},405);
 try {
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!token)return reply({error:'Não autorizado'},401);
  const {data:{user},error:authError}=await admin.auth.getUser(token);
  if(authError||!user)return reply({error:'Sessão inválida'},401);
  const {data:actor}=await admin.from('profiles').select('role').eq('id',user.id).single();
  if(actor?.role!=='Editor')return reply({error:'Apenas o Editor pode criar contas'},403);
  const {name,email,password,role}=await req.json();
  if(typeof name!=='string'||!name.trim()||name.length>120||typeof email!=='string'||!email.includes('@')||typeof password!=='string'||password.length<8||!['Editor','Analista','Fiscal','Especialista','Coordenador'].includes(role))return reply({error:'Dados inválidos. Preencha nome, e-mail, perfil e senha com pelo menos 8 caracteres.'},400);
  const {data,error}=await admin.auth.admin.createUser({email:email.trim(),password,email_confirm:true,app_metadata:{role},user_metadata:{name:name.trim()}});
  if(error)return reply({error:error.message},400);
  const {error:profileError}=await admin.from('profiles').insert({id:data.user.id,email:email.trim(),name:name.trim(),role});
  if(profileError){await admin.auth.admin.deleteUser(data.user.id);return reply({error:'Não foi possível cadastrar o perfil'},500)}
  return reply({id:data.user.id});
 }catch{return reply({error:'Não foi possível concluir a solicitação'},500)}
});
