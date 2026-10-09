# OrganizaApp — plano de produto e funcionalidades

## Objetivo

Evoluir de um inventário doméstico simples para um assistente prático da cozinha: saber o que há em casa, onde está, o que precisa ser comprado, o que deve ser consumido primeiro e o que dá para cozinhar com o estoque disponível.

Referências funcionais analisadas:
- KitchenPal: inventário por área, quantidades e validade, sincronização familiar, listas compartilhadas, receitas filtradas pelo estoque, planejamento de refeições e geração de compras a partir de receitas.
- Stokpot: alertas de baixo estoque, alimentos próximos do vencimento, receitas que priorizam esses alimentos, lista de compras recorrente (*Every Shop Items*) e consumo programado (*Auto-Discount*).

A ideia é aprender com esses padrões e criar fluxos próprios e mais claros, não copiar literalmente identidade visual, textos ou implementação proprietária.

## Princípios do OrganizaApp

1. **Inventário é a fonte da verdade.** Lista de compras, previsão de consumo e receitas devem consultar o estoque real.
2. **Nada de diminuir estoque silenciosamente.** O app sugere uma baixa de consumo prevista; a pessoa confirma, edita ou adia.
3. **Compartilhamento real por domicílio.** Estoque, compras, rotinas e planejamento são compartilhados em tempo real entre membros autorizados.
4. **Validade por lote quando necessário.** Duas caixas do mesmo alimento podem vencer em datas diferentes; o modelo não deve perder essa informação ao somar quantidades.
5. **Automação explicável.** Toda sugestão informa por que apareceu, por exemplo: “estoque baixo”, “vence em 3 dias” ou “consumo semanal previsto”.
6. **Poucos toques.** Adicionar, consumir, comprar, mover e confirmar receitas deve ser rápido, especialmente no celular.
7. **Offline resiliente e permissões seguras.** Alterações locais não podem misturar contas nem ser perdidas se a sincronização falhar.

## Funcionalidades escolhidas e versão melhorada

### A. Cozinha compartilhada / família

- Criar um domicílio compartilhado e convidar membros por link/código com validade.
- Membros veem o mesmo estoque, listas, validades e programação de consumo, com atualização em tempo real.
- Papéis iniciais: administrador e membro; somente administradores gerenciam convites e membros.
- Registrar quem alterou quantidades, marcou compras ou confirmou consumo.
- Não misturar dados pessoais ou caches de contas diferentes.

### B. Lista de compras inteligente

A lista pode receber itens de quatro fontes: inclusão manual, estoque baixo, rotina de reposição e ingredientes ausentes de receitas/planejamento.

- Sugestões automáticas sem inserir duplicados; itens equivalentes permitem ajustar quantidade.
- Quantidade desejada, unidade, categoria/corredor opcional, observações e estado comprado.
- Itens recorrentes configuráveis: toda semana, a cada duas semanas ou mensalmente.
- Ao marcar como comprado, oferecer “Adicionar ao estoque”, incluindo local e, quando aplicável, validade.
- Ao abrir a lista, priorizar itens ainda não comprados e exibir quem compartilhou/adicionou o item.
- A lista é compartilhada com o domicílio, não apenas no telefone de quem a criou.

### C. Consumo planejado — diferencial central

Cada alimento pode ter uma regra: quantidade esperada de consumo por período, por exemplo “1 caixa de leite por semana”.

- Calcular autonomia prevista com base na quantidade disponível e na taxa configurada.
- Gerar uma revisão no período escolhido: “Você previa consumir 1 caixa esta semana. Atualizar de 3 para 2?”
- Ações: confirmar consumo, informar quantidade diferente, adiar ou desativar a regra.
- Só alterar o estoque após confirmação; adiar uma sugestão não deve gerar redução automática.
- Mostrar previsão aproximada de quando acabará e oferecer adicionar à lista de compras quando se aproximar do limite.
- Permitir limites mínimos e quantidade preferida para reposição, por exemplo “avisar com 1 caixa restante; comprar 2”.
- Se a pessoa não abrir o app no dia exato, mostrar sugestões vencidas na próxima visita, sem acumular várias baixas automáticas.

### D. Validade e redução de desperdício

- Data de validade por lote/entrada, não apenas uma data única para um alimento com várias embalagens.
- Datas estimadas de conservação podem ser sugeridas como estimativas editáveis; nunca tratá-las como certeza.
- Visão “Vence em breve” com filtros de 3, 7 e 14 dias e itens vencidos.
- Ao consumir/descartar um lote, descontar daquela entrada específica.
- Receitas e sugestões de consumo priorizam ingredientes próximos de vencer.
- Não considerar um alimento vencido como seguro para consumo; informar apenas a data cadastrada e recomendar que a pessoa confira o produto.

### E. Receitas com o que já existe em casa

- Encontrar receitas por ingredientes presentes no estoque.
- Mostrar “tem 7 de 9 ingredientes” e separar o que falta, em vez de esconder ingredientes ausentes.
- Priorizar combinações que usem alimentos próximos de vencer ou que estejam sobrando.
- Filtros enxutos: tempo de preparo, tipo de refeição e restrições/preferências alimentares.
- Ao escolher uma receita, enviar ingredientes faltantes à lista de compras com um toque.
- Ao finalizar o preparo, perguntar se deseja descontar as quantidades estimadas do estoque; permitir ajustes antes de confirmar.
- Salvar favoritas e receitas planejadas para dias específicos.

### F. Planejamento semanal

- Calendário simples de refeições por dia.
- Sugestões baseadas no estoque, nas validades e nas preferências da casa.
- Trocar uma refeição individual sem refazer o plano inteiro.
- Gerar uma lista de compras consolidada, descontando os ingredientes que já existem em quantidade suficiente.
- Não exigir contagem de calorias/macros para usar o recurso básico.

### G. Entrada rápida (etapa posterior)

- Pesquisa com sugestões e unidades recentes.
- Código de barras para preencher dados básicos quando houver uma fonte confiável.
- Voz ou leitura de recibo somente depois de estabilizar o cadastro, o estoque e a sincronização.
- Não bloquear cadastro manual caso o código não seja encontrado.

## Fluxos integrados prioritários

1. **Revisão semanal:** mostrar consumos previstos, estoque baixo e itens a vencer; a pessoa confirma o que realmente consumiu e envia reposições para a lista.
2. **Vou cozinhar:** escolher uma receita baseada no estoque, priorizar itens próximos do vencimento, adicionar faltantes à lista e ajustar o estoque após o preparo.
3. **Fiz compras:** marcar a lista como comprada e transformar os itens selecionados em estoque, com local e validade.
4. **Compartilhei a casa:** todos os membros trabalham sobre os mesmos dados, sem exportar/importar manualmente.

## Ordem de implementação

### Fase 1 — Fundação de dados e família
- Definir modelo de domicílios/membros/convites e permissões no Supabase (RLS).
- Preservar o inventário pessoal atual durante a migração.
- Tela de domicílio e fluxo seguro de convite/entrada.
- Separar dados de cada domicílio em consultas e caches.

### Fase 2 — Lista de compras compartilhada
- CRUD de itens, quantidades, marcar comprado e sincronização.
- Integração com estoque baixo e itens recorrentes.
- Converter compra em estoque sem duplicações indevidas.

### Fase 3 — Validade e lotes
- Armazenar entradas/lotes e datas.
- Visão de validade e ações de consumo/descartar.
- Garantir que itens iguais com datas diferentes não sejam mesclados de forma destrutiva.

### Fase 4 — Consumo planejado
- Regras por produto, frequência, previsão de autonomia, sugestões confirmáveis e reposição.
- Registro de confirmação/adiamento para não repetir lembretes de forma irritante.

### Fase 5 — Receitas e planejamento
- Provedor de receitas definido conforme cobertura, licença, custo e limites.
- Correspondência entre ingredientes e estoque, itens faltantes, prioridade de validade e confirmação de baixa.
- Calendário de refeições e lista de compras consolidada.

### Fase 6 — Polimento e automações
- Notificações confiáveis, códigos de barras, favoritos, histórico de desperdício e atalhos de entrada.
- Medir se os recursos diminuem toques, compras duplicadas e alimentos desperdiçados antes de ampliar o escopo.

## Critérios de qualidade para cada fase

- Não perder nem misturar dados no login, logout, troca de membro ou falha de rede.
- RLS validada para membros autorizados e usuários de fora do domicílio.
- Typecheck, build e verificações automatizadas aprovadas.
- Testar os principais fluxos em telas estreitas e desktop; CI verde sozinho não substitui teste funcional.
