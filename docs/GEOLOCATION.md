# Localização e privacidade

Há três fluxos separados:

| Fluxo | Consentimento e uso | Persistência |
| --- | --- | --- |
| Editor | Minha localização obtém uma leitura e centraliza o mapa; mostra precisão. Usar como origem é outra ação. | A leitura permanece na tela. Se a pessoa salva uma parada nessa posição, ela integra o itinerário por escolha explícita. |
| Aluno | Caminho até minha parada calcula caminhada e recomendação. | Coordenadas não são gravadas no banco nem compartilhadas com o motorista. |
| Motorista | Iniciar viagem/GPS usa permissões nativas e viagem atribuída; acompanhamento em segundo plano sujeito ao Android/iOS. | Última posição e progresso operacional no D1; buffer nativo recente protegido. |

Negar permissão no editor mantém pan/zoom, busca municipal e criação por toque disponíveis. Não há permissão solicitada ao abrir o editor. Referências são consultadas no catálogo local do servidor a partir da região selecionada; coordenadas do aluno não alimentam esse catálogo. Se um Valhalla institucional for configurado, apenas os pontos necessários ao cálculo são enviados a ele.

Browser/PWA não comprova GPS contínuo com tela bloqueada. Testes de navegador com posição controlada verificam interface e contratos; homologação física deve registrar modelo do aparelho, versão Android, permissões, bateria, conexão, bloqueio e encerramento. [Critérios de GPS](GPS.md), [Driver](DRIVER.md), [roteiro](DEMO.md).
