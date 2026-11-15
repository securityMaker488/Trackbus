# Smart Journey

Entrada fictícia por nome/apelido e escola demo aberta, sem matrícula/CPF/e-mail. Rotas aprovadas, ativas e publicadas da própria escola aparecem independentemente de vínculo aluno-rota. Filtros por nome/turno, horários de referência, cartões de seleção, parada e favoritos persistem no D1 em journey_preferences. Favorito não é confirmação de vaga.

Smart Arrival, em packages/domain, projeta GPS sobre a geometria viária e calcula distância até a parada pela sequência do trajeto. Usa velocidade recente, paradas intermediárias e o maior prazo entre atraso/espera. Não soma esses prazos duas vezes. Faixa aproximada 0,8..1,3 do tempo calculado; não é modelo estatístico calibrado com trânsito. Sem velocidade confiável, posição recente, percurso viário ou previsão de retomada, informa indisponibilidade.

Smart Departure calcula floor(ETA mínimo - caminhada em minutos - margem). Estados on_time, leave_now, insufficient, unavailable; a interface distingue saída agora e margem pequena. Recomenda prudência, nunca correr atrás do veículo. Usar GPS do aluno exige ação explícita. O trajeto a pé segue vias do recorte local quando conectado; fora dele exige provedor configurado e pode ficar indisponível.

Leituras da jornada são consultadas a cada 5s com viagem em execução, 15s sem execução, pausadas com aba oculta. Avisos continuam na central interna sem Push. Marcação de leitura é persistida e autorizada por viagem. Posição do aluno e caminhada permanecem apenas no estado da página.

O mapa V6.1 divide a geometria no último progresso confirmado: restante em amarelo forte, concluído em amarelo profundo pontilhado. A confirmação automática de 2min parado aparece como “Aguardando no ponto” com o nome da parada. Não equivale à espera autorizada de5min nem acrescenta artificialmente5min ao ETA. Critérios e limitações em GPS.md.
