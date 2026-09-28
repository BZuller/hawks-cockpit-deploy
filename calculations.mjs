export function cents(value) {
  const match = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value).trim().replace(',', '.'));
  if (!match) return NaN;
  const amount = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
  return match[1] ? -amount : amount;
}
export const money = valueInCents => Number((valueInCents / 100).toFixed(2));

export function monthlyFinance(transactions, month) {
  const rows = transactions.filter(row => String(row.occurred_at).slice(0, 7) === month);
  const total = kind => rows.filter(row => row.kind === kind).reduce((sum, row) => sum + cents(row.amount), 0);
  const incoming = total('entrada');
  const outgoing = total('saida');
  return { incoming, outgoing, result: incoming - outgoing };
}

export function prospectCohort(leads, month) {
  return leads.filter(lead => new Date(lead.created_at).toISOString().slice(0, 7) === month);
}

export function funnelReached(leads, history, stages) {
  const byLead = new Map();
  for (const item of history) {
    const set = byLead.get(String(item.lead_id)) || new Set();
    set.add(item.to_stage);
    byLead.set(String(item.lead_id), set);
  }
  const reached = Object.fromEntries(stages.map(stage => [stage, 0]));
  for (const lead of leads) {
    const set = byLead.get(String(lead.id)) || new Set(['Prospect']);
    for (const stage of stages) if (set.has(stage)) reached[stage]++;
  }
  return reached;
}

export function activeMrr(clients) {
  return money(clients.filter(client => client.status === 'ativo').reduce((sum, client) => sum + cents(client.mrr), 0));
}
