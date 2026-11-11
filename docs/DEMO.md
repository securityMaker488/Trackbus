# Demonstração FECT / Congretech — Campina Grande

Somente dados fictícios. Notebook da gestão, Android arm64 autorizado, navegador do aluno, internet e conexão reserva. Ensaio em local seguro; pontos do circuito devem ser vistoriados no local e autorizados pela organização. Não são paradas escolares homologadas.

## Preparação

1. Conferir build, migrações e acesso HTTPS em ambos os celulares (DEPLOYMENT.md).
2. No notebook, autenticar como administrador e abrir a demonstração.
3. A apresentação V7 começa sem rotas. Crie origem, paradas e destino ao vivo pelo mapa, salve e publique.
4. Programe uma viagem em modo GPS real, com veículo e motorista disponíveis. Simulação usa outra viagem.
5. Escolha um trecho seguro e confira cobertura caminhável; a área do Açude Velho em Campina possui grafo local. Confira paradas e limite de espera até 300s.
6. Configurações → Conectar o motorista: gerar código, instalar APK V7 e parear com a origem HTTPS. Confirmar atribuição da viagem.
7. Abrir /#/participar no segundo navegador, informar apelido e escola.

## Apresentação

1. Em Rotas e paradas → Criar rota, preencher nome/turno/horário, clicar origem/paradas/destino, nomear, salvar.
2. Recarregar a página, abrir edição para confirmar coordenadas e IDs persistidos; publicar para alunos.
3. No navegador do aluno, buscar e escolher a nova rota/parada; favoritar e salvar.
4. Para demonstração GPS, programar viagem com motorista/veículo disponíveis. No Driver, confirmar segurança e tocar **Iniciar rota com GPS**.
5. Mostrar notificação persistente, bloquear Android e caminhar com ele em local seguro. Aluno acompanha última posição e horário. Registrar resultado real do ensaio.
6. Aluno autoriza a própria posição em Caminho até minha parada. Verificar percurso e tempo a pé. ETA exige velocidade e GPS recentes; se faltar informação, a tela deve mostrar indisponibilidade.
7. Veículo parado: motorista informa atraso de 10min ou problema mecânico. Conferir aviso/ocorrência no outro navegador. Resolver a ocorrência e observar retomada.
8. Na parada, GPS recente e parado: Aguardar 5 minutos. Conferir contagem e aviso; Encerrar espera ou aguardar expiração.
9. Encerrar viagem e GPS. Confirmar ausência de novos envios e consultar histórico/auditoria.

## Contingência e repetição

Simulador usa outra viagem, identificada como posição fictícia. Não mudar a fonte de uma viagem GPS. Simular não homologa segundo plano.
Ao terminar, programe outra viagem para a rota criada. Para recriar o percurso ao vivo, use **Remover rota**: o arquivamento preserva histórico e cancela viagens abertas na demonstração. Não há reset geral nem remoção automática de histórico.
Sem internet não há sincronização entre aparelhos, ainda que cálculo local dispense um roteador externo. Tiles OSM também dependem de rede. Não anunciar garantias de fluidez ou ETA.

## Ensaio adicional de progresso e permanência

Com o Driver6.1, iniciar GPS em viagem atribuída. O mapa do aluno deve manter o marcador na posição recebida e diminuir a linha amarela restante. Estacionar em segurança junto a uma parada configurada, manter GPS/internet e aguardar pelo menos2min de leituras contínuas: deve aparecer “Aguardando no ponto”. Movimentar-se novamente, ou interromper a viagem: a indicação deve desaparecer. Aguardar5min continua sendo ação manual separada. Conferir que a ausência de sinal jamais confirma a permanência automaticamente. Registrar fabricante/Android, permissões, bateria, duração e resultado do bloqueio de tela; este ensaio físico ainda não foi executado.
