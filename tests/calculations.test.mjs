import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, money, monthlyFinance, prospectCohort, funnelReached, activeMrr } from '../calculations.mjs';

test('MRR soma apenas clientes ativos com centavos exatos', () => {
  assert.equal(activeMrr([
    { name: 'Top Sul', status: 'ativo', mrr: '2400.00' },
    { name: 'Confraria do Doce', status: 'ativo', mrr: '500.00' },
    { name: 'Ciclo', status: 'inativo', mrr: '250.00' }
  ]), 2900);
  assert.equal(money(cents('0.10') + cents('0.20')), 0.30);
  assert.equal(cents('1.005'), NaN);
  assert.equal(cents('2400,01'), 240001);
});

test('resultado financeiro usa entradas e saídas do mês correto', () => {
  assert.deepEqual(monthlyFinance([
    { occurred_at:'2026-09-01', kind:'entrada', amount:'500.00' },
    { occurred_at:'2026-09-02', kind:'saida', amount:'149.90' },
    { occurred_at:'2026-08-31', kind:'entrada', amount:'999.00' }
  ], '2026-09'), { incoming:50000, outgoing:14990, result:35010 });
});

test('follow-up não conta como novo prospect', () => {
  const leads = [
    { id:1, created_at:'2026-09-03T12:00:00Z', updated_at:'2026-09-25T12:00:00Z' },
    { id:2, created_at:'2026-08-30T12:00:00Z', updated_at:'2026-09-20T12:00:00Z' }
  ];
  assert.deepEqual(prospectCohort(leads,'2026-09').map(x => x.id), [1]);
});

test('funil conta cada estágio alcançado uma vez por lead', () => {
  const stages = ['Prospect','Contatado','Conversa com decisor','Reunião marcada','Ganho'];
  const reached = funnelReached([{id:1},{id:2}], [
    {lead_id:1,to_stage:'Prospect'},
    {lead_id:1,to_stage:'Contatado'},
    {lead_id:1,to_stage:'Contatado'},
    {lead_id:1,to_stage:'Conversa com decisor'},
    {lead_id:1,to_stage:'Reunião marcada'},
    {lead_id:1,to_stage:'Ganho'},
    {lead_id:2,to_stage:'Prospect'}
  ], stages);
  assert.deepEqual(reached, {Prospect:2,Contatado:1,'Conversa com decisor':1,'Reunião marcada':1,Ganho:1});
});
