# Estou aguardando nesta parada

O aluno confirma voluntariamente na viagem/volta/parada selecionadas. O backend verifica sessão, instituição, rota publicada, parada do snapshot e ciclo ativo. Cada sessão tem no máximo uma confirmação ativa; repetir ou mudar a parada não incrementa a quantidade artificialmente. Expira em 15 minutos, pode ser cancelada e é removida no encerramento, troca de volta ou saída do visitante. O Cron também limpa expirados.

O motorista e a gestão recebem somente `{tripId, cycle, stopId, count}`; nunca nomes, endereços ou posição do aluno. O aluno recebe apenas sua própria confirmação. Confirmação não garante vaga, presença física, embarque ou espera obrigatória. Uma sessão demonstrativa por nome não prova identidade nem impede uma pessoa de abrir vários navegadores; os números são indicativos, não controle de capacidade.

Endpoints: `POST /api/journey/checkin`, `GET /api/journey/state`, `GET /api/state`, `GET /api/driver/trips`. Segurança e persistência são exercitadas em `tests/integration/v11-journey.test.ts`; validação real com participantes ainda deve constar do ensaio do evento.
