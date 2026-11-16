# Ciclos de viagem

Uma rota é permanente; a viagem define motorista, veículo e janela; cada volta fica em `trip_cycles`. A primeira volta nasce ao iniciar a viagem. O operador confirma **Iniciar próxima volta** somente parado em segurança. Não existe reinício automático por um único GPS na origem.

No GPS real, o backend exige posição recente (45 s), precisão até 30 m, velocidade conhecida até 0,8 m/s, retorno até 50 m da origem, pelo menos 2 minutos de ciclo, trajeto de pelo menos 200 m e progresso confiável de 90% do percurso. Sem evidência, recusa a transição. Para circuitos que não retornam à origem, finalizar o serviço e programar outro. Na simulação identificada, permite repetir apenas ao completar o percurso.

A atualização usa versão e ciclo esperado, valida o horário final e registra operador/evento/auditoria. Triggers D1 encerram a volta anterior, criam a próxima, removem localização anterior, esperas e estimativas, e cancelam entregas pendentes da volta antiga atomicamente. Pacotes GPS anteriores à nova volta são rejeitados. O APK antigo pode continuar enviando GPS na primeira volta; o Driver V11 oferece o controle de próxima volta e contagens por parada.

Após `plannedEnd`, não inicia outra volta; permite encerrar a atual em segurança. Encerrar/cancelar a viagem fecha seu ciclo e remove check-ins. Os registros de ciclos permanecem acessíveis somente aos perfis autorizados. O critério conservador não declara detecção automática de voltas homologada; testes físicos permanecem necessários.
