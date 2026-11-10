# GPS e estado operacional

Motorista envia /api/trips/:id/location, com Bearer nativo ou identidade web autorizada. Backend verifica atribuição, instituição, estado da viagem, modo e payload. Campos: lat, lng, accuracy em metros, timestamp Unix ms, speed m/s ou null, heading ou null, source gps.

Somente última posição é persistida em locations. Posição com mais de 60s aparece desatualizada. A ausência de posição é indisponibilidade, nunca simulação automática. A animação do marcador interpola apenas entre duas posições recebidas e para no último ponto.

Validação rejeita precisão >100m, futuro >10s, atraso >60s, timestamps repetidos/fora de ordem, intervalo <4s e salto além de 45m/s acrescido das incertezas. Velocidade pode ser derivada entre duas leituras confiáveis de 4..45s. O telefone não é fonte inviolável.

Nativo solicita permissões, usa foreground service Android e buffer protegido de uma leitura recente; ver DRIVER.md. Browser/PWA não garante GPS com tela bloqueada. Aluno cede sua localização por ação explícita para caminhada; coordenada não vai para cadastro ou motorista. Leitura imprecisa/antiga é recusada pela tela.

Simulação é modo separado por viagem e marcado no mapa. API e trigger recusam mistura com GPS real. Ensaios automatizados injetam coordenadas conhecidas; não equivalem a satélite, rede móvel, bloqueio de tela ou consumo medido de bateria.

## Progresso e permanência V6.1

`packages/domain/tracking.ts` projeta cada posição aceita na geometria do snapshot. Mantém progresso monotônico: não recolore como pendente um trecho por pequenas oscilações. Dados imprecisos (>35m), fora da rota (>máximo de 60m ou duas vezes a precisão) ou avanço implausível mantêm o último progresso confirmado. GPS em geometria esquemática não produz avanço confiável. O marcador continua na coordenada recebida, sem ser artificialmente preso à linha.

`locations.progress` guarda apenas o estado derivado atual, junto da última posição; atualização compara a versão anterior para evitar que leituras concorrentes sobrescrevam progresso recente. D1 remota precisa da migração0005.

Para “Aguardando no ponto”: posição até 40m da parada, precisão até 30m, velocidade até 0,7m/s, permanência dentro de 20m da âncora, intervalos entre leituras de no máximo 30s e duração de pelo menos 120s. Movimento, perda de continuidade ou baixa qualidade reiniciam a confirmação. Exibição some após 60s sem posição ou em viagem interrompida/encerrada. Cronômetro sozinho nunca confirma parada.

O estado é informativo: não inicia espera autorizada, não impõe horário limite, não encerra a viagem e não garante embarque. Projeção é uma aproximação: itinerários que se sobrepõem ou se cruzam podem exigir desambiguação adicional; não é map matching calibrado em campo.
