# Segurança e limites verificados
Controles revisados no código; resultados de testes em TESTING.md. Modelo de ameaças preservado em security/THREATS.md. Não há alegação de segurança absoluta ou auditoria externa concluída.

## Fronteira de identidade
A aplicação foi construída para gateway Sites. Header `oai-authenticated-user-id` só é confiável quando injetado e protegido por esse gateway; membership ativa determina papel e organização. O backend não implementa senha local, recuperação nem MFA próprio.
**Não publicar o Worker principal diretamente na internet confiando em headers enviados pelo navegador.** Um deploy Cloudflare independente precisa de integração autenticada verificável, por exemplo JWT do Cloudflare Access com issuer/audience/assinatura validados. Essa integração não está implementada.

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
Sem homologação de hardware, teste de recuperação do D1 remoto ou pentest independente. Auditoria vive no mesmo banco e não é imutável contra administradores do banco. Algumas alterações de estado, eventos e notificações são gravações sequenciais; falha intermediária pode exigir reconciliação. Push é melhor esforço, sem fila durável de retry. Limites de leitura e política institucional de retenção precisam ser dimensionados antes de operação em escala. Sessões expiradas são recusadas imediatamente; limpeza física depende da ação administrativa de retenção.

O gateway opcional de participantes restringe caminhos, remove identidade privilegiada e encaminha um segredo somente à origem Sites. Não foi publicado. Acesso público e GPS real exigem decisão explícita do proprietário; não ampliar audiência silenciosamente.
