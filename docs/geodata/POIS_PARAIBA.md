# Pontos de referência da Paraíba

Fonte: [extrato OSM France da Paraíba](https://download.openstreetmap.fr/extracts/south-america/brazil/northeast/paraiba-latest.osm.pbf), atualização registrada no arquivo: 13/11/2026 00:30:59 UTC. Índice derivado com 4.707 locais nomeados. Metadados, URL e SHA256 da fonte em `packages/geodata/paraiba-pois.json`.

© OpenStreetMap contributors. Dados sob [ODbL 1.0](https://www.openstreetmap.org/copyright). O índice derivado e script de extração acompanham o código para reprodução. Não foram copiados cadastros proprietários. A marca TrackBus não passa a pertencer à licença dos dados OSM.

Extração offline de nodes e ways com nome/brand e categorias selecionadas: ensino, banco, saúde, farmácia, comércio, parques, transporte, templos e serviços públicos. Exclui access=private/no; conserva apenas ID OSM, nome, categoria, coordenada de referência, município quando cadastrado e fonte. Não guarda endereço residencial, identificação de contribuidores ou posições de participantes. Polígonos usam centro aproximado de seus vértices, adequado apenas como referência visual; não são local de embarque.

Atualização manual: obtenha o extrato oficial, confira licença/origem, instale `osmium` em ambiente de ferramentas separado e execute `python packages/geodata/pois-extract.py caminho/paraiba.osm.pbf`. O runtime web/backend não depende de Python ou pyosmium. O PBF e esse ambiente de ferramentas não são publicados no aplicativo.

O catálogo é comunitário e não exaustivo. Relações complexas não são extraídas nesta versão; estabelecimentos podem estar ausentes ou desatualizados. O nome do município não é inferido de uma sede próxima, evitando atribuições geográficas falsas. Consultas do backend retornam no máximo 40 pontos a até 3km (UI usa 1,5km), ordenados por distância ao centro escolhido. Não há download completo para o navegador nem dependência do Overpass público.
