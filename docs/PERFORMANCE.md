# Desempenho e planos gratuitos — V11

Em 16/11/2026 o proprietário informou **zero erros e CPU mediana de aproximadamente 2,42 ms** no Worker existente. Essa medição pertence ao deploy atual, não ao código V11 ainda local. Nenhum Worker, D1, domínio, configuração remota ou faturamento foi alterado nesta etapa.

Workers Free documenta 10 ms de CPU por HTTP/Cron e 100 mil requisições/dia. Espera de rede não equivale a CPU. Uma mediana baixa não valida p95/p99 nem os casos de rota longa, SSR, autenticação e criptografia. [Limites oficiais](https://developers.cloudflare.com/workers/platform/limits/).

## Redução de trabalho implementada

- Envio de GPS não executa fila, envio push ou cálculo de todos os estudantes; valida apenas a viagem/posição e o progresso.
- Avisos gravam/enfileiram sem cifrar até 40 mensagens na mesma requisição.
- Cron limita a duas estimativas de saída, duas seleções para aproximação sem caminhada e quatro entregas. Consultas reúnem viagem, rota, preferências e posição; geometria de saída é lida uma vez por viagem e ETA reutilizado por parada.
- Manutenção alterna espera/recuperação de aviso, expiração Google e limpeza. Expiração cartográfica usa três comandos SQL limitados a 20 registros/tabela, sem carregar geometrias inteiras no Worker.
- Índices atendem fila, vencimento, espera e estimativa. Execuções concorrentes usam claim e versão; reprocessamento não duplica eventos.
- Resposta Google tem limite efetivo de 256.000 bytes, mesmo sem Content-Length, e 4.000 coordenadas; excesso gera indisponibilidade explícita. Sem consultas Google por pacote GPS/Cron.
- Web pausa polling com aba oculta; consultas de 5/15s; Driver limita transmissão a 5s. Nenhum serviço pago adicional.

## Capacidade e limites reais

Quatro entregas/minuto é uma capacidade deliberadamente pequena para o ensaio inicial de dois celulares. Avisos têm validade curta e podem expirar em fila quando houver muitos assinantes/eventos. Duas verificações de saída e duas de aproximação/minuto também reduzem a frequência por pessoa sob carga. Não anunciar alertas instantâneos para grandes turmas. A central de avisos independe de push. A próxima avaliação deve medir CPU e entrega real antes de ampliar os lotes; não contratar plano para encobrir um problema.

O teste D1 com nove participantes verifica lote, contagem de consultas, continuidade e rejeição de assinaturas sem sessão autorizada. A contagem de SQL e a latência local **não medem CPU na borda Cloudflare**. Miniflare comprova execução/criptografia, não homologação do limite gratuito. Em publicação futura autorizada, comparar p50/p95/p99, erros 1102, tempo de inicialização, leituras/escritas D1 e idade da fila, com dois aparelhos e depois carga gradual. Parar o ensaio ao observar erro ou atraso; preservar o deploy estável para retorno.

Google Demo Key não pode ser usada em produção. A avaliação não ativa billing; ao esgotar a quota, o produto informa falha e mantém a contingência permitida. Não há promessa de Google Maps de produção gratuito ilimitado.
