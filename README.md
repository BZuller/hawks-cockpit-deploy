# Hawks Cockpit

Ferramenta interna dos fundadores da Hawks para prospecção, clientes, MRR e financeiro gerencial.

## Arquitetura

Uma aplicação Node.js 24/TypeScript sem framework de interface e um PostgreSQL exclusivo. O servidor entrega a interface e uma API autenticada. Sem integrações externas, workers ou fila. Dados monetários são `numeric(12,2)` no PostgreSQL; cálculos no servidor usam centavos inteiros.

## Desenvolvimento

`npm ci`, configure `.env` a partir de `.env.example` e execute `npm start`. O servidor aplica `migrations/001_initial.sql` automaticamente na primeira inicialização. `npm test` valida cálculos; `npm run check` valida sintaxe.

## Autenticação e usuários

Defina `SESSION_SECRET` apenas no ambiente do Coolify. Se `BOOTSTRAP_EMAIL` e `BOOTSTRAP_PASSWORD` forem fornecidos, o usuário inicial é criado com esses dados. Sem eles, a primeira inicialização cria `infra@hawksbi.com.br` com senha aleatória de uso inicial exibida uma vez nos logs de implantação. Guarde a senha e altere-a pelo menu da aplicação. Não há cadastro público. Para usuários adicionais, use uma operação administrativa controlada no banco; não compartilhe credenciais.

## Deploy e recuperação

Crie um projeto isolado no Coolify com esta aplicação e um PostgreSQL próprio. Configure `DATABASE_URL` com a conexão interna do banco e as variáveis de autenticação como secrets. Faça deploy do Dockerfile, confirme `/health`, acesse a URL HTTPS e efetue login. Backup: use a opção Backups do PostgreSQL no Coolify; restaure primeiro o banco, então faça deploy da aplicação com o mesmo `SESSION_SECRET`. As migrations são versionadas e idempotentes.

Produção atual: projeto `Hawks Cockpit`, recursos `hawks-cockpit-web` e `hawks-cockpit-db`, backup local diário com retenção de 14 cópias. O código canônico está no repositório privado `BZuller/hawks-cockpit`; o espelho `BZuller/hawks-cockpit-deploy` existe apenas para o Coolify obter o Dockerfile, pois a integração GitHub instalada não tem acesso ao repositório privado. Ambos precisam receber o mesmo commit em futuras alterações.

## Cálculos

MRR = soma dos clientes ativos. MRR novo = MRR de clientes ativos iniciados no mês, excluindo os dois clientes históricos da base inicial. Receitas/despesas = transações lançadas no mês. Resultado = entradas menos saídas. Custos recorrentes = saídas marcadas recorrentes. Caixa gerencial = saldo inicial + transações a partir da data configurada. Novos prospects contam empresas cadastradas no mês pela data de criação do registro; follow-ups não aumentam a meta. Conversões usam o primeiro alcance de cada estágio no histórico, não o estágio atual. Taxas e ciclo de venda aparecem como dados insuficientes quando não há denominador ou ganhos.

## Limites

Controle financeiro interno, sem conciliação bancária ou contabilidade oficial. A base inicial contém somente Top Sul/Radar e Confraria do Doce/Visto, R$ 2.900 de MRR ativo. Ciclo e Agendo não integram MRR até entrarem em produção.
