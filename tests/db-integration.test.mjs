import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

test('CRUD e cálculos no PostgreSQL exclusivo, com rollback', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = await pool.connect();
  try {
    await db.query('begin');
    const marker = 'Teste transacional Hawks Cockpit';
    const created = await db.query(
      'insert into leads(company,next_action,next_action_at,potential_mrr) values($1,$2,current_date,300) returning id,stage,next_action',
      [marker, 'Ligar para decisor']
    );
    const id = created.rows[0].id;
    assert.equal(created.rows[0].stage, 'Prospect');
    assert.equal(created.rows[0].next_action, 'Ligar para decisor');
    await db.query("insert into lead_stage_history(lead_id,from_stage,to_stage) values($1,null,'Prospect')", [id]);
    await db.query('update leads set contact=$2,next_action=$3 where id=$1', [id, 'Contato Teste', 'Enviar proposta']);
    const edited = await db.query('select contact,next_action from leads where id=$1', [id]);
    assert.deepEqual(edited.rows[0], { contact:'Contato Teste', next_action:'Enviar proposta' });
    for (const [from,to] of [['Prospect','Contatado'],['Contatado','Conversa com decisor'],['Conversa com decisor','Reunião marcada'],['Reunião marcada','Reunião realizada'],['Reunião realizada','Proposta/Teste'],['Proposta/Teste','Ganho']]) {
      await db.query('update leads set stage=$2 where id=$1', [id,to]);
      await db.query('insert into lead_stage_history(lead_id,from_stage,to_stage) values($1,$2,$3)', [id,from,to]);
    }
    await db.query("update leads set closed_at=current_date,closed_mrr=300,product='Visto' where id=$1", [id]);
    const history = await db.query('select to_stage from lead_stage_history where lead_id=$1 order by id', [id]);
    assert.deepEqual(history.rows.map(x=>x.to_stage), ['Prospect','Contatado','Conversa com decisor','Reunião marcada','Reunião realizada','Proposta/Teste','Ganho']);
    await db.query("insert into clients(name,product,mrr,status,lead_id) values($1,'Visto',300,'ativo',$2)", [marker,id]);
    const mrr = await db.query("select sum(mrr)::numeric as amount from clients where status='ativo'");
    assert.equal(Number(mrr.rows[0].amount), 3200);
    const lost = await db.query("insert into leads(company,stage,loss_reason,closed_at) values($1,'Perdido','sem orçamento',current_date) returning loss_reason", [marker+' perda']);
    assert.equal(lost.rows[0].loss_reason, 'sem orçamento');
    await db.query("insert into financial_transactions(kind,category,description,amount) values('entrada','mensalidade',$1,500),('saida','infraestrutura',$2,100)", [marker,marker]);
    const finance = await db.query("select sum(case when kind='entrada' then amount else -amount end)::numeric as result from financial_transactions where description=$1", [marker]);
    assert.equal(Number(finance.rows[0].result), 400);
    const filtered = await db.query('select count(*)::int as n from leads where stage=$1 and company=$2', ['Ganho',marker]);
    assert.equal(filtered.rows[0].n, 1);
    assert.equal(1000 + Number(finance.rows[0].result), 1400);
  } finally {
    await db.query('rollback');
    db.release();
    await pool.end();
  }
});
