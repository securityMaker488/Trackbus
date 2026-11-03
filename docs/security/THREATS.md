# Modelo de ameaças

Ativos: vínculos de menores, GPS, sessões, permissões e auditoria. Fronteiras: navegador → Sites → Worker → D1/provedor de mapas. Atacantes: anônimo, outra instituição, conta comprometida e GPS adulterado.

| Risco               | Controle                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| BOLA / escalada     | instituição derivada da identidade; atribuições e parentesco verificados; Zod strict            |
| CSRF                | origem exata e JSON exigidos; sessão HttpOnly, SameSite, Secure em HTTPS                        |
| SQL injection / XSS | consultas parametrizadas e renderização React sem HTML de usuários                              |
| Abuso               | quota atômica D1, tamanho de payload limitado, consultas limitadas                              |
| GPS falso           | motorista atribuído, precisão, tempo, frequência e deslocamento plausível; não equivale a prova |
| Concorrência        | revisão/CAS, restrições de unicidade e transições válidas                                       |
| Sessão demo roubada | aleatoriedade criptográfica, hash SHA-256 no banco, expiração e vínculo ao usuário Sites        |
| Cache de PII        | API no-store; PWA somente recursos públicos                                                     |
| SSRF                | URL geográfica fixa, HTTPS, timeout; não aceitar URL do cliente                                 |

Retenção: posição atual sem trilha de alta frequência, sessão demo 1 hora, quotas 1 dia; retenção institucional de eventos requer aprovação. Limpeza administrativa de sessões expiradas/quotas. Backup: D1 Time Travel conforme plano, exercício de restauração ainda necessário.

Antes de uso real: revisão LGPD institucional, validação de vínculos, teste GPS em dispositivos externos, teste de recuperação, revisão independente de segurança e política de retenção. Auditoria no mesmo banco não é WORM. Navegador em segundo plano pode suspender GPS. Dados do dispositivo e mapas têm incerteza.
