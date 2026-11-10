# Geodados de Campina Grande e busca municipal da Paraíba

Preparação em 9 de novembro de 2026. Dados públicos de referência, sem localização de participantes.

## Fontes e cobertura

O grafo de Campina Grande deriva do [extrato Paraíba do OpenStreetMap France](https://download.openstreetmap.fr/extracts/south-america/brazil/northeast/paraiba-latest.osm.pbf), com timestamp de replicação `2026-11-09T00:32:17Z`. O download original tinha 42.357.607 bytes. A fonte normalizada retém somente nós viários, vias e restrições úteis ao roteamento; não retém nomes de contribuidores, mudanças, endereços ou dados de alunos.

O recorte `campina.json` cobre a região central e o Açude Velho de Campina Grande, delimitada por `[oeste, sul, leste, norte] = [-35.900, -7.245, -35.860, -7.205]`. Contém 9.400 nós, 11.167 segmentos, 2.394 vias e 17 restrições. São 135.657 bytes de JSON, além da fonte normalizada comprimida de 213.052 bytes.

O grafo usa os mesmos filtros, codificação e motor A* de Salvador. Preserva sentidos de vias e restrições de conversão, com perfis distintos para ônibus e pedestre. Caminhos privados, acessos condicionais não interpretados e trechos incompatíveis são excluídos conservadoramente. O ajuste máximo à via é 45 m para ônibus e 35 m para pedestre. Pontos sem conexão ou fora do recorte retornam indisponibilidade. Não há criação de segmentos sobre áreas não mapeadas.

Este recorte não corresponde a roteamento estadual completo. Visualização do mapa, navegação por coordenadas e GPS podem operar fora dele. Um itinerário viário ou uma caminhada fora dos recortes locais depende de um provedor institucional configurado e da cobertura desse provedor.

## Circuito de apresentação verificado

O arquivo [campina-demo.json](../../packages/geodata/campina-demo.json) contém três pontos sobre a [Rua Doutor Severino Cruz, via OSM 29472970](https://www.openstreetmap.org/way/29472970), junto ao Açude Velho.

| Ponto | Latitude | Longitude | Nó OSM |
| --- | --- | --- | --- |
| Açude Velho · início | -7.2227228 | -35.8774256 | 324829260 |
| Açude Velho · ponto intermediário | -7.2249866 | -35.8807931 | 324829370 |
| Açude Velho · chegada | -7.2257942 | -35.8845174 | 324829379 |

O teste com o motor existente produziu **871 m, 44 vértices e ajuste de 0 m nos três pontos**, tanto para ônibus quanto para pedestre. O cálculo nominal fornece 208 s para ônibus e 793 s a pé. Esses tempos usam velocidades convencionais do motor, não trânsito observado nem benchmark de execução. A previsão ao vivo usa o GPS e o serviço de ETA.

São referências geográficas reais sobre uma via pública mapeada, **não paradas escolares homologadas**. Antes do ensaio físico, a organização precisa escolher onde parar com segurança e confirmar acessibilidade e autorização no local. A verificação de grafo não substitui inspeção física de calçadas, sinalização ou restrições recentes.

## Busca dos 223 municípios

[paraiba-places.json](../../packages/geodata/paraiba-places.json) contém os 223 municípios da Paraíba e coordenadas de referência de suas sedes. A fonte é o [IBGE — Localidades do Brasil, Censo 2022](https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Brasil_gpkg.zip), edição disponibilizada em 2025. O filtro usa `SIGLA_UF = PB` e `SCT_LOCALIDADE = Sede Municipal` na tabela `BR_localidades_2022`.

Esse catálogo permite busca local sem enviar texto digitado ou posição do aluno a um serviço de geocodificação. O ponto IBGE representa a sede municipal; não é endereço, parada, portaria ou centroide de todos os bairros. Para distritos e localidades rurais, usar coordenadas reais ou navegar livremente no mapa.

## Reprodução e validação

Python usa apenas a biblioteca padrão para reconstruir os dois arquivos a partir das fontes pequenas já preservadas:

```sh
python packages/geodata/campina-build.py
python packages/geodata/campina-places-build.py
node packages/geodata/campina-verify.mjs
```

A validação usa a dependência de desenvolvimento `esbuild` já presente no repositório. Carrega o motor de produção sem reescrever `index.ts`, testa ônibus/pedestre, ajuste às vias, sentido inverso e rejeição de João Pessoa fora do recorte de Campina. As três verificações foram executadas com sucesso nesta preparação.

Para atualizar a fonte OSM, baixar o PBF, instalar `osmium==4.3.2` em ambiente de ferramentas separado e executar `campina-extract.py caminho/paraiba.osm.pbf`, seguido de `campina-build.py`. O extrator lê a data de replicação do PBF e produz `campina-source.json.gz`. Revisar o diff e repetir os testes antes de adotar novos dados.

Para atualizar a busca IBGE a partir do arquivo oficial, executar `campina-places-build.py --download` ou `--archive caminho/Localidades_Brasil_gpkg.zip`. O gerador exige 223 sedes distintas. Downloads grandes e ferramentas locais ficam em `work/geodata-campina/`, ignorado pelo Git.

## Integridade SHA-256

| Arquivo | SHA-256 |
| --- | --- |
| PBF original Paraíba | `9b8624a9b231702c1228deab3d86e55833019afbba56472eccd3a6ff60745869` |
| campina-source.json.gz | `1f2146723a2f7d3d33f125a90b0f27507cfe761791a35c9ee5e228d023068b56` |
| campina.json | `334f4b1f133c7d36655f88f3d603cf744146d501108f9c3dbd728d1f736777f4` |
| ZIP IBGE original | `1d96d5f0b379972a506d4b18c3696af974fbe59f8f6680557cb3a6dd38a0eb57` |
| campina-ibge-places-source.json.gz | `d60f3a149f0c4e45807a4fa3adcb7b20c520e8424f2c2e53419a6c59c2c7f6d0` |
| paraiba-places.json | `78183808ed0755d8d2bdf06ba2514aa018c4789494889a4b302e20251fa2d0d2` |

## Atribuição e serviços externos

Grafo e fonte OSM: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Conservar atribuição e disponibilizar a fonte derivada conforme a licença. Catálogo municipal: fonte IBGE, Censo Demográfico 2022, Localidades do Brasil. Nenhuma licença adicional foi atribuída ao código TrackBus.

Não há geocodificação Nominatim pública ligada por padrão. A [política oficial](https://operations.osmfoundation.org/policies/nominatim/) limita o serviço globalmente a uma consulta por segundo, exige identificação, cache e atribuição, proíbe autocomplete e restringe aplicações genéricas de busca/monitoramento de veículos. Um provedor institucional deve ser escolhido de forma compatível com uso e termos.

O [servidor público Valhalla FOSSGIS](https://valhalla.openstreetmap.de/) não é uma dependência automática do produto. A existência de uma demonstração pública não confirma cobertura, autorização para este uso ou disponibilidade garantida. O adaptador institucional existente deve receber apenas um endpoint HTTPS autorizado.
