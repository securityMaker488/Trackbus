# Editor de rotas

Abra Rotas e paradas → Criar rota. Nova rota 01 e Parada 01 são nomes automáticos; endereços e coordenadas não são obrigatórios. Toque no mapa para origem, paradas intermediárias e destino. O último ponto é o destino. Arraste os marcadores para ajustar; o modo Explorar mapa evita novos pontos enquanto consulta a região.

Desfazer/refazer guarda até 50 alterações de paradas, inclusive exclusão, ordem e nomes, somente na memória da tela. Limpar pede confirmação; cancelar a limpeza preserva o rascunho. A lista permite renomear, subir/descer/remover e, opcionalmente, ajustar coordenadas. Limite: 50 paradas, mínimo 2 distintas para salvar. Duplicar cria outra rota com novos IDs de parada e sem publicação automática.

Minha localização é opcional, pede consentimento e mostra precisão. Usar como origem só fica disponível para leitura de até dois minutos e precisão até 100m; confira a via antes de salvar. Não inicia GPS de viagem. Detalhes de privacidade em [GEOLOCATION](GEOLOCATION.md).

Buscar referências nesta região consulta até 1,5 km do centro do mapa, com filtros e até 40 resultados. Um toque perto de um POI pode sugerir “Próximo a…”, nunca “em frente”. Confirmar guarda a referência na parada. Selecionar um prédio exige escolher separadamente o ponto seguro de embarque na via; ausência de referência não impede salvar. Município aparece somente quando informado na fonte.

Pré-visualizar vias calcula sem salvar. O backend repete o cálculo ao salvar e registra geometria, fonte e distância quando disponíveis. Sem cobertura, mantém um trajeto explicitamente esquemático, com distância viária indisponível. Não é validação de condições de trânsito ou autorização de parada. A geometria pode mudar se um provedor externo atualizar entre prévia e salvamento; reabra a rota para conferir.

## Aprovação e persistência

Admin salva aprovado, inicialmente não publicado. Motorista salva draft, pode editar seus rascunhos/devoluções e envia à gestão (pending). Gestor aprova ou devolve (rejected) com justificativa. A publicação permanece uma ação separada da aprovação. Estudantes só consultam rotas aprovadas, publicadas e ativas de sua escola.

O servidor define autor/instituição, valida versões e guarda uma versão do itinerário em cada edição/cálculo. Uma viagem conserva seu snapshot. Edições concorrentes ou envio/revisão sobre versão antiga são recusados. Aprovar/publicar não muda automaticamente favoritos ou confirma vaga.

No Android 7.1, o botão Criar ou revisar rotas abre este mesmo editor no navegador, com sessão restrita vinculada ao aparelho. Não há segundo editor redundante. Código de entrada expira em 60s e só pode ser usado uma vez; sessão dura até 1h. Ao desconectar o aparelho, o editor perde acesso.

## Validação

Testes Playwright criam cinco pontos por cliques reais, alternam exploração, desfazem/refazem, reordenam, salvam e recarregam no D1 local. Outro fluxo usa pareamento real de API, entrada temporária, rascunho, aprovação, publicação e sessão independente de aluno. O teste móvel usa geolocalização controlada, consulta POIs reais do catálogo e região vazia. Capturas: [desktop](screenshots/editor-desktop.png), [celular](screenshots/editor-mobile.png). Tiles são bloqueados somente nos E2E para evitar dependência externa.
