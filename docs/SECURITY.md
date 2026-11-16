# Segurança e limites verificados
Controles revisados no código; resultados de testes em TESTING.md. Modelo de ameaças preservado em security/THREATS.md. Não há alegação de segurança absoluta ou auditoria externa concluída.

## Fronteira de identidade
A aplicação mantém dois modos explícitos. No gateway Sites, `oai-authenticated-user-id` só é confiável quando injetado e protegido pelo gateway; membership ativa determina papel e organização. No Cloudflare próprio, `AUTH_PROVIDER=cloudflare-access` exige JWT RS256 verificado com issuer, audience, validade e identidade humana, e ignora o header Sites. O primeiro administrador precisa do e-mail verificado configurado. O backend não implementa senha local, recuperação nem MFA próprio; estes pertencem ao provedor de identidade.
**Não exponha o modo Sites como Worker público independente.** Use a [configuração Cloudflare V7](CLOUDFLARE.md). A integração JWT tem testes locais e de Workerd, e o login real Access foi validado na conta publicada em 14/11/2026. Apenas admin, driver e student são papéis ativos; vínculos antigos de guardian/monitor recebem acesso negado.

Visitante fictício: token aleatório de 32 bytes, hash SHA256 no D1, cookie HttpOnly/Strict/Secure em HTTPS, 4h; escola demo aberta e allowlist restrita. Nome nunca promove papel. Troca de perfil demo pertence ao proprietário autenticado. Android: código 16 hex/2min de uso único, token 32bytes/8h; driver ativo e viagem atribuída revalidados. Certificado Android não contém segredo do servidor.

## Controles
- RBAC e escopo institucional na API, consultas parametrizadas, entradas Zod e limite de corpo 64KB.
- Escritas browser exigem Origin exato e JSON. Bearer nativo não depende de cookies; ausência de Origin não dispensa autorização.
- Limite D1 de 60 mutações/min por identidade/sessão; entrada de visitante 20/min por IP, troca de código 10/min por IP; validação GPS acrescenta intervalo mínimo 4s.
- GPS valida coordenadas, idade até 60s, futuro até 10s, precisão até 100m, ordem temporal e deslocamento plausível. Telemetria do telefone continua falsificável; isso não é atestado físico.
- Triggers impedem mistura GPS/simulação, escrita após encerramento e conflitos de agenda.
- React escapa texto; API no-store; PWA guarda somente recursos públicos. CSP usa unsafe-inline por compatibilidade do shell, ainda há espaço para endurecimento.
- Web Push permite HTTPS apenas em provedores de navegador permitidos, sem redirects; segredos VAPID ficam no servidor.
- Posição precisa do estudante não é persistida nem incluída no painel do motorista. Se Valhalla externo for configurado, coordenadas necessárias serão enviadas ao provedor escolhido.
- Localização e caminhos são expostos somente a sessões autorizadas da escola. A demonstração deve usar pessoas adultas autorizadas e cadastros fictícios.

## Riscos remanescentes
Sem homologação de hardware, teste de recuperação do D1 remoto ou pentest independente. Auditoria vive no mesmo banco e não é imutável contra administradores do banco. Algumas alterações de estado, eventos e notificações são gravações sequenciais; falha intermediária pode exigir reconciliação. Push tem fila durável de retry na V11, mas sem garantia de recebimento/leitura ou entrega exatamente uma vez. Limites de leitura, CPU gratuita e retenção precisam ser dimensionados antes de operação em escala. Sessões expiradas são recusadas imediatamente; limpeza de estado efêmero depende também do Cron.

O gateway opcional de participantes restringe caminhos, remove identidade privilegiada e encaminha um segredo somente à origem Sites. Não foi publicado. Acesso público e GPS real exigem decisão explícita do proprietário; não ampliar audiência silenciosamente.


## Rascunhos e editor do motorista

Autor/instituição são derivados da sessão. Motorista só edita rascunhos próprios ou devolvidos; não publica nem modifica solicitações já enviadas ou aprovadas. Pending não aparece a estudantes. Revisões têm versão e auditoria com ator; publicação exige approved também no D1. Snapshot de viagem permanece intacto.

Código handoff de 32 bytes, hash no D1, uso único, 60s. Fragmento removido antes da troca; cookie editor HttpOnly/Strict/Secure por até 1h, dependente de parent device ativo. Revogação/inatividade/expiração bloqueia leituras subsequentes. A sessão web não herda capacidade de transmitir GPS. POIs: consulta geográfica limitada, rate limit, catálogo local, nomes renderizados como texto React. Nenhuma URL livre é usada como provedor.

## V11

Web Push cifra o payload, mantém VAPID privado e revalida sessão, escola, rota/parada/volta e preferências antes de enviar. Endpoints pertencem a serviços conhecidos; redirecionamentos são rejeitados. Revogação e respostas 404/410 retiram a inscrição. Conteúdo da tela bloqueada vem oculto por padrão. IDs, endpoints e material de assinatura não aparecem na API administrativa ou em logs.

Check-in tem uma confirmação por sessão, expiração e troca de contexto; motorista vê contagens, nunca nomes/GPS do aluno. Contagens demonstrativas não representam identidade comprovada nem presença física. Nova volta exige CAS e contexto operacional, não um único ponto perto da origem.

Google exige chave pública restrita por origem/API e chave Routes separada no Worker, quotas e monitoramento pelo titular. CSP só libera domínios do Google quando configurado; revisão visual/CSP real permanece pendente. Place IDs podem persistir; demais dados seguem retenção curta descrita em GOOGLE_MAPS.md. Não declarar conformidade jurídica completa ou segurança absoluta a partir dos testes automatizados.
