# Mapas e cobertura
MapLibre GL preservado, cartografia OSM com tratamento escuro, ônibus SVG amarelo, linhas de ônibus e caminhada com padrões distintos. Paleta TrackBus e avisos textuais distinguem fontes/estados. Mapa inicial de edição em Campina Grande/PB; pan/zoom e coordenadas válidas não se restringem à cidade nem ao estado.

Busca local cobre 223 sedes municipais da Paraíba a partir de dados oficiais IBGE. Aceita também latitude,longitude, útil em localidades rurais. Não envia consultas para geocodificador público. Busca de endereço completo requer evolução com provedor institucional. Sede municipal não é parada nem comprovação de acesso viário.

Editor usa coordenadas reais do clique, exibe primeiro ponto, permite arrastar, renomear, remover e ordenar paradas. IDs permanecem estáveis nas edições. Salva via API/D1, gera versão e pode publicar no catálogo da escola. Horário de referência pertence à rota; programação precisa de viagem própria. Escola vem da sessão, impedindo gravação em outra organização.

Rede viária local em packages/geodata permite roteamento nos recortes documentados. Não há grafo de roteamento de toda a Paraíba. O mapa, cadastro, busca municipal e GPS têm cobertura geográfica ampla; isso é diferente de disponibilidade de itinerário viário e caminhada. Fora da rede conectada, Valhalla institucional opcional; sem provedor, linha é identificada como esquemática e ETA real fica indisponível. Não criar ruas ou conectores fictícios.

Créditos e proveniência nos documentos geodata. Tiles OSM exigem rede, atribuição e respeito à [política de tiles](https://operations.osmfoundation.org/policies/tiles/); não são baixados em lote nem armazenados para uso offline. Nominatim público não é dependência: [política oficial](https://operations.osmfoundation.org/policies/nominatim/). Para escala, avaliar licença, limites, privacidade e SLA do provedor escolhido.
