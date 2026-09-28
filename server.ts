import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import pg from 'pg';
import { cents, money, monthlyFinance, prospectCohort, funnelReached, activeMrr } from './calculations.mjs';

const { Pool } = pg;
pg.types.setTypeParser(1082, value => value);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const port = Number(process.env.PORT || 3000);
const secret = process.env.SESSION_SECRET || '';
const stages = ['Prospect','Contatado','Conversa com decisor','Reunião marcada','Reunião realizada','Proposta/Teste','Ganho','Perdido'];
const products = ['Radar','Visto','Agendo','Ciclo','Conexo','Outro'];
const lossReasons = ['preço','sem interesse','já possui solução','sem prioridade','não conseguiu chegar ao decisor','produto não atende','timing','sem orçamento','outro'];
const inCats = ['mensalidade','implantação','projeto','outro'];
const outCats = ['IA','infraestrutura','software/SaaS','domínio','APIs','contabilidade','impostos','marketing','comercial','outro'];
const safeText = (v, max = 500) => String(v ?? '').trim().slice(0,max);
const date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
const allowed = (v, set, fallback = '') => set.includes(v) ? v : fallback;

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, stored) {
  const [salt, value] = stored.split(':');
  if (!salt || !value) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(value, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function tokenFor(id) {
  const payload = `${id}.${Date.now() + 7 * 86400000}`;
  const sig = createHmac('sha256',secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function userFrom(req) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('hc_session='))?.slice(11);
  if (!raw) return null;
  const [id, expires, sig] = raw.split('.');
  if (!/^\d+$/.test(id || '') || Number(expires) < Date.now() || !sig) return null;
  const expected = createHmac('sha256',secret).update(`${id}.${expires}`).digest('hex');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected),Buffer.from(sig))) return null;
  return Number(id);
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin', ...headers });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let chunks = [];
  for await (const chunk of req) { chunks.push(chunk); if (Buffer.concat(chunks).length > 65536) throw new Error('Corpo muito grande'); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function validAmount(v, zero = false) { const n = cents(v); return Number.isFinite(n) && Number(v) <= 9999999999 && (zero ? n >= 0 : n > 0) ? money(n) : null; }
function sqlMonth(month) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '') ? month : new Date().toISOString().slice(0,7); }
async function resolvedOwner(value, fallback, allowBlank = false) {
  const requested=safeText(value,100);
  if(!requested)return allowBlank ? '' : fallback;
  const r=await pool.query("select 1 from app_users where coalesce(nullif(display_name,''),email)=$1",[requested]);
  return r.rows.length?requested:fallback;
}

async function migrate() {
  for (const file of ['001_initial.sql','002_owners.sql']) {
    await pool.query(readFileSync(join(process.cwd(),'migrations',file),'utf8'));
  }
  if (process.env.BOOTSTRAP_EMAIL && process.env.BOOTSTRAP_PASSWORD) {
    if (process.env.BOOTSTRAP_PASSWORD.length < 12) throw new Error('BOOTSTRAP_PASSWORD deve ter ao menos 12 caracteres');
    const n = await pool.query('select count(*)::int as n from app_users');
    if (n.rows[0].n === 0) await pool.query('insert into app_users(email,password_hash) values($1,$2)',[process.env.BOOTSTRAP_EMAIL.toLowerCase(),hashPassword(process.env.BOOTSTRAP_PASSWORD)]);
  } else {
    const n = await pool.query('select count(*)::int as n from app_users');
    if (n.rows[0].n === 0) {
      const password = randomBytes(24).toString('base64url');
      await pool.query('insert into app_users(email,password_hash) values($1,$2)',['infra@hawksbi.com.br',hashPassword(password)]);
      console.log(`CREDENCIAL INICIAL HAWKS COCKPIT: infra@hawksbi.com.br / ${password}`);
      console.log('Guarde a senha e altere-a após o primeiro acesso. Esta linha só aparece na criação inicial.');
    }
  }
}

async function dashboard(month) {
  const [clients,tx,leads,history,setting] = await Promise.all([
    pool.query('select * from clients'), pool.query('select * from financial_transactions'), pool.query('select * from leads'),
    pool.query('select * from lead_stage_history'), pool.query("select value from settings where key='opening_balance'")
  ]);
  const m = sqlMonth(month), active = clients.rows.filter(x=>x.status==='ativo');
  const monthlyTx = tx.rows.filter(x=>String(x.occurred_at).slice(0,7)===m);
  const { incoming, outgoing } = monthlyFinance(tx.rows,m);
  const recurringMap = new Map();
  tx.rows.filter(x=>x.kind==='saida' && x.recurring).sort((a,b)=>String(a.occurred_at).localeCompare(String(b.occurred_at))).forEach(x=>recurringMap.set(`${x.category}|${x.description}|${x.supplier}`,cents(x.amount)));
  const opening = setting.rows[0]?.value || null;
  const since = opening?.date;
  const cash = opening ? cents(opening.amount) + tx.rows.filter(x=>String(x.occurred_at).slice(0,10)>=since).reduce((s,x)=>s+(x.kind==='entrada'?1:-1)*cents(x.amount),0) : null;
  const cohort = prospectCohort(leads.rows,m);
  const reached = funnelReached(cohort,history.rows,stages.slice(0,7));
  const wins = leads.rows.filter(x=>x.stage==='Ganho' && String(x.closed_at).slice(0,7)===m);
  const losses = leads.rows.filter(x=>x.stage==='Perdido' && String(x.closed_at).slice(0,7)===m);
  const cycleDays = wins.map(x=>(new Date(x.closed_at)-new Date(x.first_prospect_at))/86400000).filter(Number.isFinite);
  const byProduct = {}, byClient = {}, byCategory = {};
  for (const c of active) { byProduct[c.product]=(byProduct[c.product]||0)+cents(c.mrr); byClient[c.name]=(byClient[c.name]||0)+cents(c.mrr); }
  for (const t of monthlyTx.filter(x=>x.kind==='saida')) byCategory[t.category]=(byCategory[t.category]||0)+cents(t.amount);
  const businessDays = (()=>{ const [y,mo]=m.split('-').map(Number), end = m===new Date().toISOString().slice(0,7) ? new Date().getDate() : new Date(y,mo,0).getDate(); let n=0; for(let d=1;d<=end;d++){const day=new Date(y,mo-1,d).getDay();if(day!==0&&day!==6)n++;}return n;})();
  return { month:m, mrr:activeMrr(clients.rows), newMrr:money(active.filter(x=>x.source!=='Dado inicial autorizado'&&String(x.started_at).slice(0,7)===m).reduce((s,x)=>s+cents(x.mrr),0)), received:money(incoming), expenses:money(outgoing), result:money(incoming-outgoing), recurringCosts:money([...recurringMap.values()].reduce((a,b)=>a+b,0)), cash:cash===null?null:money(cash), byProduct:Object.fromEntries(Object.entries(byProduct).map(([k,v])=>[k,money(v)])), byClient:Object.fromEntries(Object.entries(byClient).map(([k,v])=>[k,money(v)])), byCategory:Object.fromEntries(Object.entries(byCategory).map(([k,v])=>[k,money(v)])), prospects:cohort.length, target:150, targetPercent:Math.round(cohort.length/150*100), perBusinessDay:businessDays?Number((cohort.length/businessDays).toFixed(1)):null, meetings:reached['Reunião realizada'], proposals:reached['Proposta/Teste'], wins:wins.length, losses:losses.length, wonMrr:money(wins.reduce((s,x)=>s+cents(x.closed_mrr||0),0)), reached, prospectToWin:cohort.length?Number((reached.Ganho/cohort.length*100).toFixed(1)):null, meetingToWin:reached['Reunião realizada']?Number((reached.Ganho/reached['Reunião realizada']*100).toFixed(1)):null, averageTicket:wins.length?money(wins.reduce((s,x)=>s+cents(x.closed_mrr||0),0)/wins.length):null, averageCycle:cycleDays.length?Number((cycleDays.reduce((a,b)=>a+b,0)/cycleDays.length).toFixed(1)):null };
}

async function api(req,res,url) {
  const path = url.pathname, method=req.method;
  if (path==='/api/login' && method==='POST') {
    const b=await body(req), result=await pool.query('select * from app_users where email=$1',[safeText(b.email,255).toLowerCase()]);
    const user=result.rows[0]; if (!user || !verifyPassword(String(b.password||''),user.password_hash)) return send(res,401,{error:'E-mail ou senha inválidos.'});
    return send(res,200,{email:user.email},{'Set-Cookie':`hc_session=${tokenFor(user.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`});
  }
  if (path==='/api/logout' && method==='POST') return send(res,200,{ok:true},{'Set-Cookie':'hc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  const userId=userFrom(req); if (!userId) return send(res,401,{error:'Faça login para continuar.'});
  if (method!=='GET' && method!=='HEAD') { const origin=req.headers.origin; if(origin && new URL(origin).host!==req.headers.host) return send(res,403,{error:'Origem inválida.'}); }
  const auth=await pool.query('select id,email,display_name from app_users where id=$1',[userId]);
  const currentUser=auth.rows[0]; if(!currentUser)return send(res,401,{error:'Sessão inválida.'});
  const ownerName=currentUser.display_name||currentUser.email;
  if(path==='/api/session'&&method==='GET') return send(res,200,{email:currentUser.email,name:ownerName});
  if(path==='/api/users'&&method==='GET') {const r=await pool.query("select email,coalesce(nullif(display_name,''),email) as name from app_users order by display_name,email");return send(res,200,r.rows);}
  if(path==='/api/admin/users'&&method==='POST') {if(currentUser.email!=='infra@hawksbi.com.br')return send(res,403,{error:'Acesso restrito.'});const b=await body(req), email=safeText(b.email,255).toLowerCase(), name=safeText(b.name,80);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name)return send(res,400,{error:'Informe e-mail e nome válidos.'});const password=randomBytes(24).toString('base64url');const r=await pool.query('insert into app_users(email,display_name,password_hash) values($1,$2,$3) on conflict(email) do nothing returning id',[email,name,hashPassword(password)]);return send(res,r.rows[0]?201:409,r.rows[0]?{email,name,temporaryPassword:password}:{error:'Usuário já existe.'});}
  if(path==='/api/password'&&method==='POST') {const b=await body(req);if(String(b.new_password||'').length<12)return send(res,400,{error:'A nova senha precisa ter pelo menos 12 caracteres.'});const r=await pool.query('select password_hash from app_users where id=$1',[userId]);if(!r.rows[0]||!verifyPassword(String(b.current_password||''),r.rows[0].password_hash))return send(res,403,{error:'Senha atual incorreta.'});await pool.query('update app_users set password_hash=$2 where id=$1',[userId,hashPassword(String(b.new_password))]);return send(res,200,{ok:true});}
  if(path==='/api/dashboard'&&method==='GET') return send(res,200,await dashboard(url.searchParams.get('month')));
  if(path==='/api/leads'&&method==='GET') { const r=await pool.query('select * from leads order by created_at desc limit 500'); return send(res,200,r.rows); }
  if(path==='/api/clients'&&method==='GET') { const r=await pool.query('select * from clients order by status, name limit 500'); return send(res,200,r.rows); }
  if(path==='/api/transactions'&&method==='GET') { const r=await pool.query('select * from financial_transactions order by occurred_at desc, id desc limit 500'); return send(res,200,r.rows); }
  if(path==='/api/settings'&&method==='GET') { const r=await pool.query("select value from settings where key='opening_balance'"); return send(res,200,{openingBalance:r.rows[0]?.value||null}); }
  if(path==='/api/settings'&&method==='PUT') { const b=await body(req), amount=money(cents(b.amount)), d=date(b.date); if(!Number.isFinite(amount)||!d)return send(res,400,{error:'Informe valor e data válidos.'}); await pool.query("insert into settings(key,value) values('opening_balance',$1::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify({amount,date:d})]); return send(res,200,{ok:true}); }
  if(path==='/api/leads'&&method==='POST') { const b=await body(req); if(!safeText(b.company,160))return send(res,400,{error:'Informe a empresa.'}); const mrr=validAmount(b.potential_mrr||0,true); if(mrr===null)return send(res,400,{error:'MRR potencial inválido.'}); const owner=await resolvedOwner(b.owner,ownerName);const client=await pool.connect(); try { await client.query('begin'); const r=await client.query('insert into leads(company,segment,city,contact,contact_channel,source,owner,first_prospect_at,next_action,next_action_at,potential_mrr,notes) values($1,$2,$3,$4,$5,$6,$7,coalesce($8::date,current_date),$9,$10,$11,$12) returning *',[safeText(b.company,160),safeText(b.segment,100),safeText(b.city,100),safeText(b.contact,160),safeText(b.contact_channel,160),safeText(b.source,100),owner,date(b.first_prospect_at),safeText(b.next_action,250),date(b.next_action_at),mrr,safeText(b.notes,3000)]); await client.query("insert into lead_stage_history(lead_id,from_stage,to_stage) values($1,null,'Prospect')",[r.rows[0].id]); await client.query('commit'); return send(res,201,r.rows[0]); } catch(e){await client.query('rollback');throw e;} finally{client.release();} }
  const leadMatch=path.match(/^\/api\/leads\/(\d+)$/);
  if(leadMatch&&method==='PUT') { const b=await body(req), mrr=validAmount(b.potential_mrr||0,true), owner=await resolvedOwner(b.owner,ownerName,true); if(!safeText(b.company,160)||mrr===null)return send(res,400,{error:'Empresa e MRR válido são necessários.'}); const r=await pool.query('update leads set company=$2,segment=$3,city=$4,contact=$5,contact_channel=$6,source=$7,owner=$8,first_prospect_at=coalesce($9::date,first_prospect_at),last_contact_at=$10,next_action=$11,next_action_at=$12,potential_mrr=$13,notes=$14,updated_at=now() where id=$1 returning *',[leadMatch[1],safeText(b.company,160),safeText(b.segment,100),safeText(b.city,100),safeText(b.contact,160),safeText(b.contact_channel,160),safeText(b.source,100),owner,date(b.first_prospect_at),date(b.last_contact_at),safeText(b.next_action,250),date(b.next_action_at),mrr,safeText(b.notes,3000)]); return send(res,r.rows[0]?200:404,r.rows[0]||{error:'Lead não encontrado.'}); }
  const historyMatch=path.match(/^\/api\/leads\/(\d+)\/history$/);
  if(historyMatch&&method==='GET') {const r=await pool.query('select * from lead_stage_history where lead_id=$1 order by changed_at,id',[historyMatch[1]]);return send(res,200,r.rows);}
  const stageMatch=path.match(/^\/api\/leads\/(\d+)\/stage$/);
  if(stageMatch&&method==='POST') { const b=await body(req), stage=allowed(b.stage,stages); if(!stage)return send(res,400,{error:'Estágio inválido.'}); if(stage==='Perdido'&&!allowed(b.loss_reason,lossReasons))return send(res,400,{error:'Selecione o motivo da perda.'}); if(stage==='Ganho'&&(!allowed(b.product,products)||validAmount(b.closed_mrr)===null))return send(res,400,{error:'Informe produto e MRR fechado.'}); const client=await pool.connect(); try {await client.query('begin');const current=await client.query('select * from leads where id=$1 for update',[stageMatch[1]]);const lead=current.rows[0];if(!lead){await client.query('rollback');return send(res,404,{error:'Lead não encontrado.'});}if(lead.stage===stage){await client.query('rollback');return send(res,400,{error:'O lead já está neste estágio.'});}const closed=stage==='Ganho'||stage==='Perdido';const r=await client.query('update leads set stage=$2,closed_at=case when $3 then current_date else null end,closed_mrr=$4,product=$5,loss_reason=$6,loss_detail=$7,notes=case when $8::text = \'\' then notes else concat_ws(E\'\\n\',notes,$8::text) end,updated_at=now() where id=$1 returning *',[lead.id,stage,closed,stage==='Ganho'?validAmount(b.closed_mrr):null,stage==='Ganho'?b.product:null,stage==='Perdido'?b.loss_reason:null,stage==='Perdido'?safeText(b.loss_detail,500):null,safeText(b.note,500)]);await client.query('insert into lead_stage_history(lead_id,from_stage,to_stage,note) values($1,$2,$3,$4)',[lead.id,lead.stage,stage,safeText(b.note,500)]);if(stage==='Ganho'&&b.create_client){await client.query('insert into clients(name,product,mrr,started_at,status,source,notes,lead_id,owner) values($1,$2,$3,current_date,\'ativo\',$4,$5,$6,$7) on conflict(name,product) do nothing',[lead.company,b.product,validAmount(b.closed_mrr),lead.source,safeText(b.note,500),lead.id,lead.owner]);}await client.query('commit');return send(res,200,r.rows[0]);}catch(e){await client.query('rollback');throw e;}finally{client.release();} }
  if(path==='/api/clients'&&method==='POST') {const b=await body(req),mrr=validAmount(b.mrr,true),owner=await resolvedOwner(b.owner,ownerName);if(!safeText(b.name,160)||!allowed(b.product,products)||mrr===null)return send(res,400,{error:'Informe cliente, produto e MRR válido.'});const r=await pool.query('insert into clients(name,product,mrr,started_at,status,source,notes,owner) values($1,$2,$3,coalesce($4::date,current_date),$5,$6,$7,$8) returning *',[safeText(b.name,160),b.product,mrr,date(b.started_at),allowed(b.status,['ativo','inativo'],'ativo'),safeText(b.source,100),safeText(b.notes,3000),owner]);return send(res,201,r.rows[0]);}
  const clientMatch=path.match(/^\/api\/clients\/(\d+)$/);if(clientMatch&&method==='PUT'){const b=await body(req),mrr=validAmount(b.mrr,true),owner=await resolvedOwner(b.owner,ownerName,true);if(!safeText(b.name,160)||!allowed(b.product,products)||mrr===null)return send(res,400,{error:'Dados do cliente inválidos.'});const r=await pool.query('update clients set name=$2,product=$3,mrr=$4,started_at=coalesce($5::date,started_at),status=$6,source=$7,notes=$8,owner=$9,updated_at=now() where id=$1 returning *',[clientMatch[1],safeText(b.name,160),b.product,mrr,date(b.started_at),allowed(b.status,['ativo','inativo'],'ativo'),safeText(b.source,100),safeText(b.notes,3000),owner]);return send(res,r.rows[0]?200:404,r.rows[0]||{error:'Cliente não encontrado.'});}
  if(path==='/api/transactions'&&method==='POST'){const b=await body(req),kind=allowed(b.kind,['entrada','saida']),amount=validAmount(b.amount),category=allowed(b.category,kind==='entrada'?inCats:outCats);if(!kind||!category||!safeText(b.description,250)||amount===null)return send(res,400,{error:'Informe tipo, categoria, descrição e valor válido.'});const r=await pool.query('insert into financial_transactions(occurred_at,kind,category,description,amount,client_id,supplier,recurring,notes) values(coalesce($1::date,current_date),$2,$3,$4,$5,$6,$7,$8,$9) returning *',[date(b.occurred_at),kind,category,safeText(b.description,250),amount,b.client_id||null,safeText(b.supplier,160),Boolean(b.recurring),safeText(b.notes,3000)]);return send(res,201,r.rows[0]);}
  return send(res,404,{error:'Rota não encontrada.'});
}

function staticFile(res,path) {const file=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','style.css'].includes(file)){res.writeHead(404);res.end();return;}const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};const contents=readFileSync(join(process.cwd(),'public',file));res.writeHead(200,{'Content-Type':mime[extname(file)],'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'same-origin'});res.end(contents);}

if(!process.env.DATABASE_URL||secret.length<32) throw new Error('Configure DATABASE_URL e SESSION_SECRET (32+ caracteres).');
await migrate();
createServer(async(req,res)=>{try{const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(url.pathname==='/health')return send(res,200,{status:'ok'});if(url.pathname.startsWith('/api/'))return await api(req,res,url);return staticFile(res,url.pathname);}catch(e){console.error(e);if(e.code==='23505')return send(res,409,{error:'Registro já existe.'});if(e instanceof SyntaxError)return send(res,400,{error:'Dados inválidos.'});return send(res,500,{error:'Não foi possível concluir. Tente novamente.'});}}).listen(port,'0.0.0.0',()=>console.log(`Hawks Cockpit ouvindo na porta ${port}`));
