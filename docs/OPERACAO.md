# Operação e demonstração

## Acesso

A publicação é privada. Entre com a conta proprietária pelo Sites e selecione **Abrir demonstração**. O bootstrap cria uma instituição fictícia isolada, com veículos, motoristas, alunos, responsáveis, rotas e viagens. Nenhum cadastro inicial representa uma pessoa real.

O seletor **Perfil de demonstração** troca a autorização no servidor. Use Administrador, Motorista, Aluno, Responsável ou Monitor. A sessão demo é um cookie HttpOnly com prazo de uma hora, vinculado à identidade proprietária. Duas abas do mesmo navegador compartilham cookies: para mostrar perfis simultâneos, use contextos/perfis de navegador separados.

## Roteiro FECT / Congretech

1. Como administrador, confira o painel, abra Veículos e cadastre um registro. Recarregue para mostrar persistência.
2. Abra Rotas e paradas. Edite uma rota, inclua/reordene paradas e salve. As viagens existentes conservam o itinerário original.
3. Abra uma viagem em andamento. Confirme a operação com veículo parado e ative o simulador. Ele avança enquanto essa janela permanece aberta; os dados seguem a mesma API de leitura e aparecem como **SIMULADO**.
4. Em outro contexto de navegador, entre como Aluno ou Responsável. Acompanhe somente a rota vinculada. A atualização é por consulta autenticada a cada cinco segundos.
5. Envie um aviso de atraso de dez minutos. Confirme o aviso no perfil do aluno e a atualização do ETA quando houver posição recente e condições suficientes.
6. Registre pane mecânica. A viagem fica interrompida e uma ocorrência é criada. Resolva-a em Ocorrências para comunicar retomada.
7. Como Monitor, registre embarque e desembarque. O servidor rejeita desembarque anterior ao embarque e duplicidade.
8. Consulte despesas, manutenção, relatório CSV e auditoria. Os números vêm dos registros persistidos.

Os cenários alteram a demonstração de verdade; não há reset automático nem gravações de interface reproduzidas como se fossem dados ao vivo. Para manter uma apresentação limpa, use uma nova instituição de demonstração em uma conta autorizada separada ou prepare os registros com antecedência.

## GPS em campo

Somente o motorista atribuído pode transmitir GPS, após ativação explícita. Use HTTPS e permita localização no navegador; opere controles apenas com o veículo parado. Posições antigas, imprecisas, rápidas demais, duplicadas ou fora de ordem são rejeitadas. Simulação não comprova GPS físico. Suspensão do navegador em segundo plano pode interromper a transmissão; o painel sinaliza localização desatualizada após 60 segundos.

Antes de transportar pessoas com o sistema: configurar roteamento, validar os trajetos com a instituição, fazer teste com celulares em redes distintas, verificar relógio/permissões, e realizar ensaio de recuperação. Esses ensaios físicos ainda não foram executados.

## Contingência

Na perda de internet, o aplicativo mostra uma página offline pública e orienta reconectar. Ele não guarda nomes, sessões ou posições em cache offline. Não tratar a última posição como atual nem prometer horário exato. O responsável operacional deve usar o canal de contato previamente definido pela instituição. A demonstração não oferece comunicação de emergência.

## Provedor geográfico

Configure a variável de servidor `VALHALLA_URL` com um serviço HTTPS administrado ou contratado, compatível com Valhalla. A aplicação chama `/route`, com `costing: bus` ou `pedestrian`, `format: osrm` e `shape_format: geojson`. A URL nunca vem do cliente; redirecionamentos são recusados, há timeout e validação de resposta. Testes locais verificam o contrato com uma resposta de fixture; nenhum provedor real foi contratado/configurado.

Depois de configurar, use **Calcular vias** no cartão da rota e crie uma nova viagem para usar o novo itinerário. Uma viagem existente conserva seu snapshot. O cálculo a pé usa a posição cedida naquele pedido e não a persiste. A indicação de saída usa a menor estimativa do ônibus, duração da caminhada e margem de três minutos.

Mapas: atribuição OpenStreetMap visível, sem prefetch de tiles ou cache offline. O serviço público de tiles não oferece SLA. Para uso institucional em escala, contratar mapas ou hospedar conforme as respectivas licenças. Referência: [política de tiles OSM](https://operations.osmfoundation.org/policies/tiles/) e [API Valhalla](https://valhalla.github.io/valhalla/api/route/api-reference/).

## Implantação e dados

`.openai/hosting.json` contém o projeto Sites existente e o binding D1 `DB`. Sites aplica migrações hospedadas ao publicar. O banco local em `.wrangler/state` é separado do banco publicado. Não enviar essa pasta nem segredos ao repositório. Não alterar migrações já aplicadas; acrescente novas.

A API confia na identidade injetada pelo gateway autenticado do Sites. **Não expor este Worker diretamente na internet** sem substituir essa integração por validação criptográfica de identidade. Cabeçalhos de identidade fornecidos por um cliente externo não são autenticação.

Para uma publicação independente, implementar e testar outro provedor de autenticação, configurar D1 e adaptar bindings/segredos. Backup usa os recursos disponíveis no plano D1; um teste de restauração ainda é obrigatório. Consulte [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) e verifique o plano efetivamente contratado; custo zero em produção não foi garantido.
