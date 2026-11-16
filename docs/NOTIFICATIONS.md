# Avisos e notificações
Motorista autorizado/admin informa atraso, pane, trânsito, interrupção, assistência, chegada antecipada ou informação. Motorista confirma local seguro; GPS recente em movimento bloqueia o comunicado. Pane/interrupção/assistência abre ocorrência e interrompe viagem. Resolver ocorrência permite retomada e mantém histórico.

Atraso informado substitui deadline anterior; não acumula minutos repetidos. Espera valida parada próxima, GPS recente, limite da escola até 300s e uma espera por parada. Contagem regressiva deriva de waitUntil. Expiração é reconciliada na leitura autorizada e pelo Cron V11 com batch condicional idempotente.

Central interna, contador, leitura por pessoa, preferências da rota/parada e alertas de aproximação/saída funcionam sem consentimento Push. V11 usa Web Push opcional com payload cifrado e ocultação de detalhes ativada por padrão. Exige HTTPS, navegador compatível, registro ativo e consentimento. Não existe chat privado, SMS nem WhatsApp.

Fila durável, revalidação de acesso, tentativas limitadas, expiração e preferências estão implementadas. O envio ocorre em lotes pequenos no Cron, sem promessa de entrega imediata; backlog pode fazer avisos expirarem. Central interna permanece disponível. Consulte [WEB_PUSH.md](WEB_PUSH.md) para configuração e ensaio obrigatório com página fechada, ainda pendente em aparelho físico.
