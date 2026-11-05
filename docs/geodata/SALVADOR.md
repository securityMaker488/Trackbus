# Malha demonstrativa de Salvador

O TrackBus dispõe de um recorte fixo de vias reais na região das três rotas fictícias. O cálculo usa a conectividade de nós OpenStreetMap e o comprimento dos segmentos. As coordenadas do aluno são usadas em memória. O módulo opera sem requisições de rede e sem armazenamento de consultas. O chamador decide se executa no navegador ou no Worker.

## Dados e atribuição

Dados © OpenStreetMap contributors. O extrato, a base normalizada e o grafo derivado são disponibilizados sob ODbL 1.0. Preserve o crédito visível no mapa e junto ao resultado calculado. Consulte a [atribuição OpenStreetMap](https://www.openstreetmap.org/copyright) e a [licença ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

A aquisição consultou `overpass-api.de/api/interpreter` com o retângulo fixo da demonstração. A consulta pediu vias com `highway`, seus nós e relações de restrição que as referenciam. O servidor informou `timestamp_osm_base` de `2026-11-04T02:37:28Z` (23h37min28s de 3 de novembro, horário da Bahia). A data refere-se à versão da base do provedor. [Política da API OpenStreetMap e alternativas para extração](https://operations.osmfoundation.org/policies/api/).

| Recorte ou arquivo | Valor |
|---|---|
| Oeste, sul, leste, norte | −38.517, −13.005, −38.461, −12.969 |
| Consulta bruta | 36.850 nós, 7.040 vias, 43 relações |
| Grafo admitido | 26.006 nós, 27.651 segmentos, 4.940 vias, 33 regras de conversão aplicáveis |
| Base normalizada | `packages/geodata/salvador-source.json.gz`, 605.664 bytes, SHA-256 `cfe1d0fb22cbcbd48c8d1f4a40358750cce22fc905344558023c31a24509fc4f` |
| Grafo embarcado | `packages/geodata/salvador.json`, 382.263 bytes, SHA-256 `2a7a3a599a770a1409b5c7c8b995894f7f68028cd57632bdbcd9a3c55de19089` |

A base normalizada conserva IDs, coordenadas, topologia, barreiras, acessos e restrições usados na compilação. Nomes, endereços e outras tags sem função no roteamento foram removidos. O arquivo comprimido permite reconstrução sem depender da disponibilidade do Overpass.

## Contrato

`calculateLocalRoute(points, "pedestrian" | "bus")` recebe de dois a 64 pontos `{lat, lng}` ordenados. Retorna `null` para entradas inválidas, percursos sem cobertura e pontos desconectados na topologia admitida. Um resultado contém os seguintes campos.

- `geometry` com pares `[longitude, latitude]` sobre a malha local.
- `meters` com a distância arredondada ao longo dos segmentos.
- `seconds` com estimativa baseada em 1,1 m/s para pedestres ou 4,2 m/s para o percurso planejado de ônibus.
- `source` com o valor `osm-local` e `snapMeters` com o afastamento de cada ponto até a via usada.

A velocidade de planejamento do ônibus serve para descrever o itinerário. O ETA operacional continua usando velocidade e posição recentes da viagem. A projeção sobre uma via admite até 35 metros no perfil a pé ou 45 metros no perfil de ônibus. A geometria começa e termina na via mapeada. O curto trecho entre o GPS e a via projetada deve ser avaliado no local. Fora dos limites, preserve o estado de indisponibilidade.

O motor A* respeita a topologia, os sentidos permitidos por perfil e as restrições de conversão representáveis no recorte. O filtro exclui vias privadas, obras e segmentos com barreiras incompatíveis. Vias com condicionantes de acesso ou dimensões que o modelo de ônibus não consegue verificar podem ser excluídas de forma conservadora. Escadas, calçadas, travessias e restrições OSM refletem o cadastro colaborativo. Uma pessoa da instituição precisa vistoriar o local antes de usar o percurso para transportar passageiros. A base fixa precisa ser atualizada para refletir obras, mudanças de tráfego e passagens fechadas.

## Reprodução

A partir da raiz do projeto, execute os comandos abaixo.

```sh
python packages/geodata/build.py
npx --no-install tsx packages/geodata/verify.ts
```

O primeiro comando usa a base normalizada entregue. O segundo verifica a integração com a malha do recorte. A opção `python packages/geodata/build.py --download` solicita ao Overpass o mesmo recorte histórico. O acesso externo depende do serviço público. `--source caminho.osm.json.gz` aceita outra captura de mesma região e versão para inspeção. Para atualizar o extrato, confirme a data de origem em `build.py`, gere e arquive a nova fonte e reexecute a verificação antes de publicar.

## Circuito demonstrativo

A Rua Caetano Moura contém um percurso curto com pontos sobre o traçado cartográfico. Confira se o local está autorizado e adequado antes de um teste físico.

| Ordem | Latitude | Longitude |
|---|---:|---:|
| 1 | −12.9978788 | −38.5130599 |
| 2 | −12.9990528 | −38.5110559 |
| 3 | −12.9967469 | −38.5076226 |

O resultado medido foi de 727 metros e 48 vértices no itinerário de três paradas, nos dois perfis. A projeção dos três pontos ficou abaixo de um metro. A verificação também confirmou desvio de mais de 2 km ao tentar voltar na contramão de um trecho de 67 metros da Avenida Vasco da Gama, rejeição de coordenadas inválidas ou fora da cobertura e rejeição de um ponto sem via admissível próxima.

Na Rota 01 do seed, o itinerário completo admitido pelo perfil de ônibus mediu 11.737 metros via malha. As rotas 02 e 03 do seed não obtiveram um caminho completo dentro das regras do recorte. Cadastros e viagens existentes mantêm suas coordenadas e versões. Use um circuito vistoriado ou revise os pontos no editor antes de ativar um itinerário real.
