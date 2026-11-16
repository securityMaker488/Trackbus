# Demonstração FECT / Congretech — Campina Grande

Somente dados fictícios. Notebook da gestão, Android arm64 autorizado, navegador do aluno, internet e conexão reserva. Ensaio em local seguro; pontos do circuito devem ser vistoriados no local e autorizados pela organização. Não são paradas escolares homologadas.

## Preparação

1. Conferir build, migrações e acesso HTTPS em ambos os celulares (DEPLOYMENT.md).
2. No notebook, autenticar como administrador e abrir a demonstração.
3. A apresentação V7 começa sem rotas. Crie origem, paradas e destino ao vivo pelo mapa, salve e publique.
4. Programe uma viagem em modo GPS real, com veículo e motorista disponíveis. Simulação usa outra viagem.
5. Escolha um trecho seguro e confira cobertura caminhável; a área do Açude Velho em Campina possui grafo local. Confira paradas e limite de espera até 300s.
6. Configurações → Conectar o motorista: gerar código, instalar APK V11 com backend compatível e parear com a origem HTTPS. Confirmar atribuição da viagem.
7. Abrir /#/participar no segundo navegador, informar apelido e escola.

## Apresentação

1. Em Rotas e paradas → Criar rota, usar os nomes automáticos, clicar origem/paradas/destino e salvar. Turno/horário e nomes podem ser ajustados.
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

Com o Driver V11 e backend compatível, iniciar GPS em viagem atribuída. O mapa do aluno deve manter o marcador na posição recebida e diminuir a linha amarela restante. Estacionar em segurança junto a uma parada configurada, manter GPS/internet e aguardar pelo menos2min de leituras contínuas: deve aparecer “Aguardando no ponto”. Movimentar-se novamente, ou interromper a viagem: a indicação deve desaparecer. Aguardar5min continua sendo ação manual separada. Conferir que a ausência de sinal jamais confirma a permanência automaticamente. Registrar fabricante/Android, permissões, bateria, duração e resultado do bloqueio de tela; este ensaio físico ainda não foi executado.


## Mostrar o novo editor e a colaboração

1. “Minha localização” pede autorização; mostrar precisão e conferir a via. Pode usar a posição como origem.
2. Buscar referências na região, filtrar Bancos ou Escolas, escolher um local disponível e “Adicionar parada próxima”. Tocar na via e confirmar a sugestão “Próximo a…”. Se a referência não existir, continuar com nome automático.
3. Criar cinco pontos, mostrar Explorar mapa, desfazer/refazer e reordenação. Pré-visualizar vias e explicar qualquer aviso de cobertura.
4. No Driver conectado, abrir “Criar ou revisar rotas”, salvar outro rascunho e enviar para aprovação. Na gestão, revisar, aprovar e publicar. No aluno, atualizar e escolher a nova rota.
5. Arquivar somente as rotas descartáveis criadas no ensaio; não apagar dados de terceiros. Voltar ao roteiro GPS/avisos acima.

## Ensaio V11 para a FECT — 30/11 e 01/12/2026

1. Antes do evento, configurar/homologar Google conforme GOOGLE_MAPS.md. Sem chave, apresentar honestamente o mapa existente; não anunciar Google ativo ou offline.
2. Criar rota por cliques, pesquisar estabelecimentos quando Google estiver habilitado, desenhar um rascunho e mostrar a diferença para caminho viário. Publicar e selecionar no aluno.
3. Usar APK V11 pareado; iniciar GPS, bloquear a tela e registrar resultado do ensaio físico. Mover-se apenas em área segura.
4. Dois participantes confirmam espera na mesma parada. Mostrar quantidade no motorista, cancelar uma confirmação, conferir expiração sem revelar nomes.
5. Calcular caminhada ou informar tempo habitual. Ativar push e confirmar inscrição. Fechar a página e provocar um aviso operacional; verificar chegada real, horário e abertura da viagem. Repetir Smart Departure dentro da validade de dez minutos. Falha de entrega deve ser registrada, nunca substituída por aviso simulado como se fosse push real.
6. Completar percurso, retornar à origem, parar em segurança e confirmar nova volta dentro do horário. Conferir contador, histórico, check-ins antigos removidos e necessidade de atualizar caminhada. A volta não reinicia automaticamente por aproximação.
7. Registrar espera de cinco minutos e conferir encerramento mesmo com as páginas fechadas, pelo Cron. Encerrar viagem/GPS e preservar histórico.

Contingência: preparar notebook com dependências instaladas, build e D1 local. Simulador utiliza dados explicitamente fictícios; não comprova GPS real. Sem internet, tiles Google/OSM, sincronização e push não são garantidos. Preferir uma apresentação local previamente ensaiada e capturas reais identificadas, sem prometer conectividade inexistente.
