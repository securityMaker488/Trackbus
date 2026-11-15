# Mapas e cobertura
MapLibre GL preservado, cartografia OSM com tratamento escuro, ônibus SVG amarelo, linhas de ônibus e caminhada com padrões distintos. Paleta TrackBus e avisos textuais distinguem fontes/estados. Mapa inicial de edição em Campina Grande/PB; pan/zoom e coordenadas válidas não se restringem à cidade nem ao estado.

Busca local cobre 223 sedes municipais da Paraíba a partir de dados oficiais IBGE. Aceita também latitude,longitude, útil em localidades rurais. Não envia consultas para geocodificador público. Busca de endereço completo requer evolução com provedor institucional. Sede municipal não é parada nem comprovação de acesso viário.

Editor usa coordenadas reais do clique, exibe primeiro ponto, permite arrastar, renomear, remover e ordenar paradas. IDs permanecem estáveis nas edições. Salva via API/D1, gera versão e pode publicar no catálogo da escola. Horário de referência pertence à rota; programação precisa de viagem própria. Escola vem da sessão, impedindo gravação em outra organização.

Rede viária local em packages/geodata permite roteamento nos recortes documentados. Não há grafo de roteamento de toda a Paraíba. O mapa, cadastro, busca municipal e GPS têm cobertura geográfica ampla; isso é diferente de disponibilidade de itinerário viário e caminhada. Fora da rede conectada, Valhalla institucional opcional; sem provedor, linha é identificada como esquemática e ETA real fica indisponível. Não criar ruas ou conectores fictícios.

Créditos e proveniência nos documentos geodata. Tiles OSM exigem rede, atribuição e respeito à [política de tiles](https://operations.osmfoundation.org/policies/tiles/); não são baixados em lote nem armazenados para uso offline. Nominatim público não é dependência: [política oficial](https://operations.osmfoundation.org/policies/nominatim/). Para escala, avaliar licença, limites, privacidade e SLA do provedor escolhido.


## Referências e editor V7.1

Catálogo local de 4.707 POIs nomeados do extrato OSM France da Paraíba, dados de 13/11/2026. O navegador recebe no máximo 40 resultados próximos por consulta, nunca o catálogo inteiro. Há filtros por escola, universidade, banco, saúde, farmácia, comércio, parque, terminal, igreja e serviços públicos. Dados comunitários não garantem presença/funcionamento de todo estabelecimento. Município é mostrado quando informado na fonte; sua ausência é explícita.

A seleção de um prédio é uma referência. “Adicionar parada próxima” exige outro toque em uma via segura; não converte o centro do prédio em embarque. A até 150m, pode sugerir “Próximo a…”, sujeito à confirmação. Não afirma “em frente”. Sem POI, mantém Parada 01 etc. [Editor](ROUTE_EDITOR.md) e [proveniência](geodata/POIS_PARAIBA.md).

Nenhuma consulta em tempo de uso vai ao Overpass público ou ao Nominatim. A política do Overpass recomenda infraestrutura própria para apps dependentes do serviço; por isso usamos um extrato offline licenciado: [política oficial](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html). Tiles continuam sob sua política própria.
