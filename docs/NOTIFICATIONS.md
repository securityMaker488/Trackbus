# Avisos e notificações
Motorista autorizado/admin informa atraso, pane, trânsito, interrupção, assistência, chegada antecipada ou informação. Motorista confirma local seguro; GPS recente em movimento bloqueia o comunicado. Pane/interrupção/assistência abre ocorrência e interrompe viagem. Resolver ocorrência permite retomada e mantém histórico.

Atraso informado substitui deadline anterior; não acumula minutos repetidos. Espera valida parada próxima, GPS recente, limite da escola até 300s e uma espera por parada. Contagem regressiva deriva de waitUntil. Expiração é reconciliada na próxima leitura autorizada com batch condicional idempotente; não depende de cron.

Central interna, contador, leitura por pessoa, preferências da rota/parada e alertas de aproximação/saída funcionam sem consentimento Push. Push é opcional via VAPID, payload vazio e mensagem genérica do Service Worker. Exige HTTPS, browser compatível, registro ativo e consentimento. Não existe chat privado, SMS nem WhatsApp.

Entrega por push é melhor esforço, limitada a 50 assinaturas por aviso com lotes de 8 e timeout. Deduplicação lastNotice ocorre antes do envio; falhas de rede não têm fila de retry. Expiração automática da espera aparece na central, sem promessa de push. Sem validação física de entrega nesta etapa.
